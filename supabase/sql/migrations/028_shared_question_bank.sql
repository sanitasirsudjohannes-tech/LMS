-- 028_shared_question_bank.sql
-- Satu bank soal digunakan bersama untuk Pre-Test dan Post-Test.
-- Jalankan setelah migration 027.
--
-- Kolom questions.test_type dipertahankan untuk kompatibilitas data lama,
-- tetapi tidak lagi menentukan soal Pre-Test vs Post-Test. Semua soal aktif
-- pada satu pelatihan menjadi bank soal bersama. Jika data lama memiliki soal
-- identik pada dua tab, fungsi peserta mengambil satu saja secara deterministik.

BEGIN;

COMMENT ON COLUMN public.questions.test_type IS
  'Kolom kompatibilitas lama. Sejak migration 028, semua soal aktif pada pelatihan dipakai bersama untuk Pre-Test dan Post-Test. Soal baru disimpan sebagai pretest secara internal.';

CREATE OR REPLACE FUNCTION private.build_test_question_snapshot(
  p_training_id UUID,
  p_test_type TEXT
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bank AS (
    SELECT DISTINCT ON (
      lower(regexp_replace(trim(q.question), '\s+', ' ', 'g'))
    )
      q.*
    FROM public.questions q
    WHERE q.training_id = p_training_id
      AND q.active
    ORDER BY
      lower(regexp_replace(trim(q.question), '\s+', ' ', 'g')),
      CASE WHEN q.test_type = 'pretest' THEN 0 ELSE 1 END,
      q.id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'training_id', q.training_id,
        'test_type', p_test_type,
        'question', q.question,
        'option_a', q.option_a,
        'option_b', q.option_b,
        'option_c', q.option_c,
        'option_d', q.option_d,
        'correct_answer', upper(q.correct_answer),
        'active', true
      )
      ORDER BY q.id
    ),
    '[]'::jsonb
  )
  FROM bank q;
$$;

REVOKE ALL ON FUNCTION private.build_test_question_snapshot(UUID, TEXT)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_test_questions(
  p_training_id UUID,
  p_test_type TEXT
)
RETURNS TABLE (
  id UUID,
  training_id UUID,
  test_type TEXT,
  question TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'peserta'
  ) THEN
    RAISE EXCEPTION 'Akses hanya untuk peserta';
  END IF;

  IF p_test_type NOT IN ('pretest', 'posttest') THEN
    RAISE EXCEPTION 'Jenis tes tidak valid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trainings t
    WHERE t.id = p_training_id
      AND t.active
      AND (t.start_date IS NULL OR t.start_date <= now())
      AND (t.end_date IS NULL OR t.end_date >= now())
  ) THEN
    RAISE EXCEPTION 'Pelatihan tidak aktif atau di luar periode';
  END IF;

  IF p_test_type = 'posttest' AND EXISTS (
    SELECT 1
    FROM public.materials m
    WHERE m.training_id = p_training_id
      AND m.active
      AND NOT EXISTS (
        SELECT 1
        FROM public.material_progress mp
        WHERE mp.user_id = auth.uid()
          AND mp.material_id = m.id
          AND mp.completed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Selesaikan seluruh materi sebelum membuka Post-Test';
  END IF;

  RETURN QUERY
  WITH bank AS (
    SELECT DISTINCT ON (
      lower(regexp_replace(trim(q.question), '\s+', ' ', 'g'))
    )
      q.*
    FROM public.questions q
    WHERE q.training_id = p_training_id
      AND q.active
    ORDER BY
      lower(regexp_replace(trim(q.question), '\s+', ' ', 'g')),
      CASE WHEN q.test_type = 'pretest' THEN 0 ELSE 1 END,
      q.id
  )
  SELECT
    q.id,
    q.training_id,
    p_test_type::TEXT,
    q.question,
    q.option_a,
    q.option_b,
    q.option_c,
    q.option_d,
    q.active
  FROM bank q
  ORDER BY q.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_test_questions(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_test_questions(UUID, TEXT) TO authenticated;

-- Checklist kesiapan sekarang hanya membutuhkan satu bank soal bersama.
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
    9::INTEGER,
    (
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
      b.period_ok
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

NOTIFY pgrst, 'reload schema';
COMMIT;
