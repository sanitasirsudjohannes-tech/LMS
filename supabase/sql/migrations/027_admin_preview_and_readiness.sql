-- 027_admin_preview_and_readiness.sql
-- Mode Uji Coba Admin + checklist kesiapan pelatihan.
-- Jalankan setelah migration 026.
--
-- Prinsip:
-- 1) Uji coba admin tidak menulis ke test_attempts/material_progress/certificates/training_reviews.
-- 2) State simulasi disimpan terpisah pada admin_preview_sessions.
-- 3) Perubahan materi/soal/aturan utama menaikkan structure_version sehingga preview lama tidak dipakai.
-- 4) Checklist kesiapan dihitung server-side agar ringan dan konsisten.

BEGIN;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS structure_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.admin_preview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  structure_version INTEGER NOT NULL,
  current_step TEXT NOT NULL DEFAULT 'pretest'
    CHECK (current_step IN ('pretest', 'material', 'posttest', 'review', 'certificate')),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'expired')),
  preview_data JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(preview_data) = 'object'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS admin_preview_sessions_admin_training_idx
  ON public.admin_preview_sessions (admin_id, training_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS admin_preview_sessions_training_version_idx
  ON public.admin_preview_sessions (training_id, structure_version, status);

ALTER TABLE public.admin_preview_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_preview_sessions_select_admin ON public.admin_preview_sessions;
CREATE POLICY admin_preview_sessions_select_admin
ON public.admin_preview_sessions
FOR SELECT TO authenticated
USING (admin_id = auth.uid() AND private.is_lms_admin());

DROP POLICY IF EXISTS admin_preview_sessions_insert_admin ON public.admin_preview_sessions;
CREATE POLICY admin_preview_sessions_insert_admin
ON public.admin_preview_sessions
FOR INSERT TO authenticated
WITH CHECK (admin_id = auth.uid() AND private.is_lms_admin());

DROP POLICY IF EXISTS admin_preview_sessions_update_admin ON public.admin_preview_sessions;
CREATE POLICY admin_preview_sessions_update_admin
ON public.admin_preview_sessions
FOR UPDATE TO authenticated
USING (admin_id = auth.uid() AND private.is_lms_admin())
WITH CHECK (admin_id = auth.uid() AND private.is_lms_admin());

DROP POLICY IF EXISTS admin_preview_sessions_delete_admin ON public.admin_preview_sessions;
CREATE POLICY admin_preview_sessions_delete_admin
ON public.admin_preview_sessions
FOR DELETE TO authenticated
USING (admin_id = auth.uid() AND private.is_lms_admin());

REVOKE ALL ON TABLE public.admin_preview_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_preview_sessions TO authenticated;

CREATE OR REPLACE FUNCTION private.bump_training_structure_from_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.trainings
    SET structure_version = structure_version + 1
    WHERE id = NEW.training_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.trainings
    SET structure_version = structure_version + 1
    WHERE id = OLD.training_id;
    RETURN OLD;
  END IF;

  UPDATE public.trainings
  SET structure_version = structure_version + 1
  WHERE id = NEW.training_id;

  IF OLD.training_id IS DISTINCT FROM NEW.training_id THEN
    UPDATE public.trainings
    SET structure_version = structure_version + 1
    WHERE id = OLD.training_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS materials_bump_training_structure_version ON public.materials;
CREATE TRIGGER materials_bump_training_structure_version
AFTER INSERT OR UPDATE OR DELETE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION private.bump_training_structure_from_content();

DROP TRIGGER IF EXISTS questions_bump_training_structure_version ON public.questions;
CREATE TRIGGER questions_bump_training_structure_version
AFTER INSERT OR UPDATE OR DELETE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION private.bump_training_structure_from_content();

CREATE OR REPLACE FUNCTION private.bump_training_structure_from_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.passing_score IS DISTINCT FROM OLD.passing_score
     OR NEW.max_posttest_attempts IS DISTINCT FROM OLD.max_posttest_attempts
     OR NEW.jpl IS DISTINCT FROM OLD.jpl
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.posttest_start_at IS DISTINCT FROM OLD.posttest_start_at THEN
    NEW.structure_version := OLD.structure_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trainings_bump_structure_version_before_update ON public.trainings;
CREATE TRIGGER trainings_bump_structure_version_before_update
BEFORE UPDATE OF passing_score, max_posttest_attempts, jpl, start_date, end_date, posttest_start_at
ON public.trainings
FOR EACH ROW
EXECUTE FUNCTION private.bump_training_structure_from_settings();

CREATE OR REPLACE FUNCTION public.admin_preview_start(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version INTEGER;
  v_session public.admin_preview_sessions%ROWTYPE;
  v_initial JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN
    RAISE EXCEPTION 'Akses hanya untuk admin';
  END IF;

  SELECT t.structure_version
  INTO v_version
  FROM public.trainings t
  WHERE t.id = p_training_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelatihan tidak ditemukan';
  END IF;

  UPDATE public.admin_preview_sessions
  SET status = 'expired', updated_at = now()
  WHERE admin_id = auth.uid()
    AND training_id = p_training_id
    AND status IN ('in_progress', 'completed')
    AND (structure_version <> v_version OR expires_at <= now());

  SELECT s.*
  INTO v_session
  FROM public.admin_preview_sessions s
  WHERE s.admin_id = auth.uid()
    AND s.training_id = p_training_id
    AND s.structure_version = v_version
    AND s.status IN ('in_progress', 'completed')
    AND s.expires_at > now()
  ORDER BY s.updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_session);
  END IF;

  v_initial := jsonb_build_object(
    'pretest', jsonb_build_object('answers', '{}'::jsonb, 'submitted', false, 'score', NULL),
    'materials', jsonb_build_object('completed_ids', '[]'::jsonb, 'started_at', '{}'::jsonb, 'current_index', 0),
    'posttest', jsonb_build_object('answers', '{}'::jsonb, 'attempts', '[]'::jsonb, 'submitted', false, 'score', NULL, 'passed', false),
    'review', jsonb_build_object('material_rating', 0, 'system_rating', 0, 'speaker_rating', 0, 'suggestion', '', 'submitted', false)
  );

  INSERT INTO public.admin_preview_sessions (
    admin_id, training_id, structure_version, current_step, status, preview_data
  )
  VALUES (
    auth.uid(), p_training_id, v_version, 'pretest', 'in_progress', v_initial
  )
  RETURNING * INTO v_session;

  RETURN to_jsonb(v_session);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_preview_save(
  p_session_id UUID,
  p_preview_data JSONB,
  p_current_step TEXT,
  p_status TEXT DEFAULT 'in_progress'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.admin_preview_sessions%ROWTYPE;
  v_current_version INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN
    RAISE EXCEPTION 'Akses hanya untuk admin';
  END IF;

  IF p_current_step NOT IN ('pretest', 'material', 'posttest', 'review', 'certificate') THEN
    RAISE EXCEPTION 'Tahap preview tidak valid';
  END IF;

  IF p_status NOT IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION 'Status preview tidak valid';
  END IF;

  IF p_preview_data IS NULL OR jsonb_typeof(p_preview_data) <> 'object' THEN
    RAISE EXCEPTION 'Data preview tidak valid';
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.admin_preview_sessions s
  WHERE s.id = p_session_id
    AND s.admin_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi uji coba tidak ditemukan';
  END IF;

  SELECT t.structure_version
  INTO v_current_version
  FROM public.trainings t
  WHERE t.id = v_session.training_id;

  IF v_current_version IS DISTINCT FROM v_session.structure_version THEN
    UPDATE public.admin_preview_sessions
    SET status = 'expired', updated_at = now()
    WHERE id = p_session_id;
    RAISE EXCEPTION 'Struktur pelatihan berubah. Mulai ulang Mode Uji Coba untuk menggunakan materi dan soal terbaru.';
  END IF;

  UPDATE public.admin_preview_sessions
  SET preview_data = p_preview_data,
      current_step = p_current_step,
      status = p_status,
      updated_at = now(),
      completed_at = CASE WHEN p_status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
      expires_at = now() + interval '7 days'
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN to_jsonb(v_session);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_preview_reset(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version INTEGER;
  v_session public.admin_preview_sessions%ROWTYPE;
  v_initial JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN
    RAISE EXCEPTION 'Akses hanya untuk admin';
  END IF;

  SELECT t.structure_version
  INTO v_version
  FROM public.trainings t
  WHERE t.id = p_training_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelatihan tidak ditemukan';
  END IF;

  UPDATE public.admin_preview_sessions
  SET status = 'expired', updated_at = now()
  WHERE admin_id = auth.uid()
    AND training_id = p_training_id
    AND status IN ('in_progress', 'completed');

  v_initial := jsonb_build_object(
    'pretest', jsonb_build_object('answers', '{}'::jsonb, 'submitted', false, 'score', NULL),
    'materials', jsonb_build_object('completed_ids', '[]'::jsonb, 'started_at', '{}'::jsonb, 'current_index', 0),
    'posttest', jsonb_build_object('answers', '{}'::jsonb, 'attempts', '[]'::jsonb, 'submitted', false, 'score', NULL, 'passed', false),
    'review', jsonb_build_object('material_rating', 0, 'system_rating', 0, 'speaker_rating', 0, 'suggestion', '', 'submitted', false)
  );

  INSERT INTO public.admin_preview_sessions (
    admin_id, training_id, structure_version, current_step, status, preview_data
  )
  VALUES (
    auth.uid(), p_training_id, v_version, 'pretest', 'in_progress', v_initial
  )
  RETURNING * INTO v_session;

  RETURN to_jsonb(v_session);
END;
$$;

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
      (t.start_date IS NOT NULL AND t.end_date IS NOT NULL AND t.start_date <= t.end_date) AS period_ok,
      ((SELECT count(*) FROM public.questions q WHERE q.training_id = t.id AND q.active AND q.test_type = 'pretest') > 0) AS pretest_ok,
      ((SELECT count(*) FROM public.materials m WHERE m.training_id = t.id AND m.active) > 0) AS materials_ok,
      ((SELECT count(*) FROM public.questions q WHERE q.training_id = t.id AND q.active AND q.test_type = 'posttest') > 0) AS posttest_ok,
      (t.passing_score > 0 AND t.passing_score <= 100) AS passing_ok,
      (t.jpl > 0) AS jpl_ok,
      COALESCE((SELECT cs.certificate_enabled FROM public.certificate_settings cs WHERE cs.training_id = t.id LIMIT 1), false) AS certificate_ok,
      (
        COALESCE(NULLIF(trim((SELECT g.signatory_name FROM public.certificate_global_settings g WHERE g.singleton = true LIMIT 1)), ''), '') <> ''
        AND COALESCE((SELECT g.signatory_image_url FROM public.certificate_global_settings g WHERE g.singleton = true LIMIT 1), '') <> ''
      ) AS signature_ok,
      (COALESCE((SELECT g.stamp_image_url FROM public.certificate_global_settings g WHERE g.singleton = true LIMIT 1), '') <> '') AS stamp_ok,
      EXISTS (
        SELECT 1
        FROM public.admin_preview_sessions aps
        WHERE aps.admin_id = auth.uid()
          AND aps.training_id = t.id
          AND aps.structure_version = t.structure_version
          AND aps.status = 'completed'
      ) AS preview_ok,
      (SELECT count(*)::INTEGER FROM public.questions q WHERE q.training_id = t.id AND q.active AND q.test_type = 'pretest') AS pretest_count,
      (SELECT count(*)::INTEGER FROM public.materials m WHERE m.training_id = t.id AND m.active) AS material_count,
      (SELECT count(*)::INTEGER FROM public.questions q WHERE q.training_id = t.id AND q.active AND q.test_type = 'posttest') AS posttest_count,
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
      CASE WHEN b.period_ok THEN 1 ELSE 0 END +
      CASE WHEN b.pretest_ok THEN 1 ELSE 0 END +
      CASE WHEN b.materials_ok THEN 1 ELSE 0 END +
      CASE WHEN b.posttest_ok THEN 1 ELSE 0 END +
      CASE WHEN b.passing_ok THEN 1 ELSE 0 END +
      CASE WHEN b.jpl_ok THEN 1 ELSE 0 END +
      CASE WHEN b.certificate_ok THEN 1 ELSE 0 END +
      CASE WHEN b.signature_ok THEN 1 ELSE 0 END +
      CASE WHEN b.stamp_ok THEN 1 ELSE 0 END +
      CASE WHEN b.preview_ok THEN 1 ELSE 0 END
    )::INTEGER,
    (
      b.period_ok AND b.pretest_ok AND b.materials_ok AND b.posttest_ok
      AND b.passing_ok AND b.jpl_ok AND b.certificate_ok
      AND b.signature_ok AND b.stamp_ok AND b.preview_ok
    ),
    jsonb_build_object(
      'period', jsonb_build_object('ok', b.period_ok, 'label', 'Periode pelatihan valid'),
      'pretest', jsonb_build_object('ok', b.pretest_ok, 'label', 'Soal Pre-Test tersedia', 'count', b.pretest_count),
      'materials', jsonb_build_object('ok', b.materials_ok, 'label', 'Materi aktif tersedia', 'count', b.material_count),
      'posttest', jsonb_build_object('ok', b.posttest_ok, 'label', 'Soal Post-Test tersedia', 'count', b.posttest_count),
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

REVOKE ALL ON FUNCTION private.bump_training_structure_from_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bump_training_structure_from_settings() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_preview_start(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_start(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_preview_save(UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_save(UUID, JSONB, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_preview_reset(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_reset(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_training_readiness_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_training_readiness_list() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
