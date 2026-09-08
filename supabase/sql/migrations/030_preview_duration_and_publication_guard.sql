-- 030_preview_duration_and_publication_guard.sql
-- Jalankan setelah 029. Tidak mengubah timer/progres/sertifikat peserta.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_training_readiness_list()
RETURNS TABLE (
  training_id UUID,
  total_items INTEGER,
  completed_items INTEGER,
  ready BOOLEAN,
  details JSONB,
  preview_completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN
    RAISE EXCEPTION 'Akses hanya untuk admin';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id,
      t.structure_version,
      EXISTS (
        SELECT 1 FROM public.admin_preview_sessions aps
        WHERE aps.admin_id = auth.uid() AND aps.training_id = t.id
          AND aps.structure_version = t.structure_version AND aps.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM public.materials m
            WHERE m.training_id = t.id AND m.active
              AND NOT COALESCE((aps.preview_data #> '{materials,duration_reviewed_ids}') @> jsonb_build_array(m.id::text), false)
          )
      ) AS duration_ok,
      (t.start_date IS NOT NULL AND t.end_date IS NOT NULL AND t.start_date <= t.end_date) AS period_ok,
      (
        (
          SELECT count(DISTINCT lower(regexp_replace(trim(q.question), '\s+', ' ', 'g')))
          FROM public.questions q
          WHERE q.training_id = t.id AND q.active
        ) > 0
      ) AS question_bank_ok,
      (
        SELECT count(DISTINCT lower(regexp_replace(trim(q.question), '\s+', ' ', 'g')))::INTEGER
        FROM public.questions q
        WHERE q.training_id = t.id AND q.active
      ) AS question_count,
      ((SELECT count(*) FROM public.materials m WHERE m.training_id = t.id AND m.active) > 0) AS materials_ok,
      (t.passing_score > 0 AND t.passing_score <= 100) AS passing_ok,
      (t.jpl > 0) AS jpl_ok,
      COALESCE(
        (SELECT cs.certificate_enabled FROM public.certificate_settings cs WHERE cs.training_id = t.id LIMIT 1),
        false
      ) AS certificate_ok,
      (
        COALESCE(NULLIF(trim((SELECT g.signatory_name FROM public.certificate_global_settings g WHERE g.singleton = true LIMIT 1)), ''), '') <> ''
        AND COALESCE((SELECT g.signatory_image_url FROM public.certificate_global_settings g WHERE g.singleton = true LIMIT 1), '') <> ''
      ) AS signature_ok,
      (
        COALESCE((SELECT g.stamp_image_url FROM public.certificate_global_settings g WHERE g.singleton = true LIMIT 1), '') <> ''
      ) AS stamp_ok,
      EXISTS (
        SELECT 1
        FROM public.admin_preview_sessions aps
        WHERE aps.admin_id = auth.uid()
          AND aps.training_id = t.id
          AND aps.structure_version = t.structure_version
          AND aps.status = 'completed'
      ) AS preview_ok,
      (SELECT count(*)::INTEGER FROM public.materials m WHERE m.training_id = t.id AND m.active) AS material_count,
      (
        SELECT max(aps.completed_at)
        FROM public.admin_preview_sessions aps
        WHERE aps.admin_id = auth.uid()
          AND aps.training_id = t.id
          AND aps.structure_version = t.structure_version
          AND aps.status = 'completed'
      ) AS last_preview_completed
    FROM public.trainings t
  )
  SELECT
    b.id,
    10::INTEGER,
    (
      CASE WHEN b.duration_ok THEN 1 ELSE 0 END +
      CASE WHEN b.period_ok THEN 1 ELSE 0 END +
      CASE WHEN b.question_bank_ok THEN 1 ELSE 0 END +
      CASE WHEN b.materials_ok THEN 1 ELSE 0 END +
      CASE WHEN b.passing_ok THEN 1 ELSE 0 END +
      CASE WHEN b.jpl_ok THEN 1 ELSE 0 END +
      CASE WHEN b.certificate_ok THEN 1 ELSE 0 END +
      CASE WHEN b.signature_ok THEN 1 ELSE 0 END +
      CASE WHEN b.stamp_ok THEN 1 ELSE 0 END +
      CASE WHEN b.preview_ok THEN 1 ELSE 0 END
    )::INTEGER,
    (
      b.duration_ok AND b.period_ok
      AND b.question_bank_ok
      AND b.materials_ok
      AND b.passing_ok
      AND b.jpl_ok
      AND b.certificate_ok
      AND b.signature_ok
      AND b.stamp_ok
      AND b.preview_ok
    ),
    jsonb_build_object(
      'duration_review', jsonb_build_object('ok', b.duration_ok, 'label', 'Durasi seluruh materi sudah ditinjau'),
      'period', jsonb_build_object('ok', b.period_ok, 'label', 'Periode pelatihan valid'),
      'question_bank', jsonb_build_object('ok', b.question_bank_ok, 'label', 'Bank soal Pre-Test & Post-Test tersedia', 'count', b.question_count),
      'materials', jsonb_build_object('ok', b.materials_ok, 'label', 'Materi aktif tersedia', 'count', b.material_count),
      'passing_score', jsonb_build_object('ok', b.passing_ok, 'label', 'Passing grade valid'),
      'jpl', jsonb_build_object('ok', b.jpl_ok, 'label', 'JPL sudah diatur'),
      'certificate', jsonb_build_object('ok', b.certificate_ok, 'label', 'Sertifikat diaktifkan'),
      'signature', jsonb_build_object('ok', b.signature_ok, 'label', 'Nama dan tanda tangan direktur tersedia'),
      'stamp', jsonb_build_object('ok', b.stamp_ok, 'label', 'Cap rumah sakit tersedia'),
      'preview', jsonb_build_object('ok', b.preview_ok, 'label', 'Uji coba selesai pada versi terbaru')
    ),
    b.last_preview_completed
  FROM base b
  ORDER BY b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_training_readiness_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_training_readiness_list() TO authenticated;


-- AFTER memastikan checklist membaca pengaturan dan structure_version TERBARU.
-- INSERT aktif juga diperiksa; upsert pada baris yang sudah ada tetap UPDATE.
CREATE OR REPLACE FUNCTION private.guard_training_publication_readiness()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_readiness RECORD;
BEGIN
  IF NOT COALESCE(NEW.active, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.active, false) THEN RETURN NEW; END IF;
  END IF;
  SELECT * INTO v_readiness FROM public.admin_training_readiness_list() r
  WHERE r.training_id = NEW.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checklist kesiapan tidak tersedia'; END IF;
  IF NOT COALESCE(v_readiness.ready, false) THEN
    RAISE EXCEPTION 'Publikasi dibatalkan: checklist belum lengkap (%/%). Simpan perubahan sebagai draf, tinjau durasi, dan selesaikan uji coba versi terbaru.', v_readiness.completed_items, v_readiness.total_items;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_training_publication_readiness ON public.trainings;
CREATE TRIGGER guard_training_publication_readiness
AFTER INSERT OR UPDATE ON public.trainings FOR EACH ROW
EXECUTE FUNCTION private.guard_training_publication_readiness();

-- Sesi kadaluarsa/reset tidak boleh dihidupkan kembali lewat save.
-- Penyelesaian memerlukan seluruh tahap dan persetujuan durasi versi saat ini.
CREATE OR REPLACE FUNCTION private.validate_admin_preview_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'expired' AND (OLD.status = 'expired' OR OLD.expires_at <= now()) THEN
    RAISE EXCEPTION 'Sesi uji coba kedaluwarsa. Mulai ulang uji coba.';
  END IF;
  IF NEW.status = 'completed' THEN
    IF NEW.current_step <> 'certificate'
       OR NEW.preview_data #>> '{pretest,submitted}' IS DISTINCT FROM 'true'
       OR NEW.preview_data #>> '{posttest,passed}' IS DISTINCT FROM 'true'
       OR NEW.preview_data #>> '{review,submitted}' IS DISTINCT FROM 'true'
       OR EXISTS (
         SELECT 1 FROM public.materials m WHERE m.training_id = NEW.training_id AND m.active
           AND (NOT COALESCE((NEW.preview_data #> '{materials,completed_ids}') @> jsonb_build_array(m.id::text), false)
             OR NOT COALESCE((NEW.preview_data #> '{materials,duration_reviewed_ids}') @> jsonb_build_array(m.id::text), false))
       ) THEN
      RAISE EXCEPTION 'Selesaikan seluruh tahap uji coba dan tinjau durasi setiap materi sebelum menyelesaikan uji coba.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_admin_preview_completion ON public.admin_preview_sessions;
CREATE TRIGGER validate_admin_preview_completion BEFORE UPDATE ON public.admin_preview_sessions
FOR EACH ROW EXECUTE FUNCTION private.validate_admin_preview_completion();
REVOKE ALL ON FUNCTION private.validate_admin_preview_completion() FROM PUBLIC, anon, authenticated;
-- Penulisan hanya melalui RPC yang memeriksa admin, kepemilikan dan versi.
REVOKE INSERT, UPDATE, DELETE ON public.admin_preview_sessions FROM authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
