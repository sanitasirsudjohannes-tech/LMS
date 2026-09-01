-- Perbaikan stabilitas setelah seluruh migrasi awal LMS dijalankan.
-- Aman dijalankan ulang. Jalankan melalui Supabase SQL Editor.

BEGIN;

-- Peserta dengan akun Auth tetapi profil lama yang belum lengkap tetap muncul.
CREATE OR REPLACE FUNCTION public.admin_training_participants(
  p_training_id UUID,
  p_search TEXT DEFAULT '',
  p_status TEXT DEFAULT 'all',
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  institution TEXT,
  nip_nik TEXT,
  created_at TIMESTAMPTZ,
  pre_score NUMERIC,
  post_score NUMERIC,
  status TEXT,
  certificate_number TEXT,
  total_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH activity AS (
    SELECT user_id FROM public.test_attempts WHERE training_id = p_training_id
    UNION
    SELECT user_id FROM public.certificates WHERE training_id = p_training_id
    UNION
    SELECT mp.user_id
    FROM public.material_progress mp
    JOIN public.materials m ON m.id = mp.material_id
    WHERE m.training_id = p_training_id
  ), attempt_stats AS (
    SELECT
      user_id,
      MAX(score) FILTER (WHERE test_type = 'pretest') AS pre_score,
      MAX(score) FILTER (WHERE test_type = 'posttest') AS post_score
    FROM public.test_attempts
    WHERE training_id = p_training_id
    GROUP BY user_id
  ), rows AS (
    SELECT
      x.user_id,
      COALESCE(NULLIF(p.full_name, ''), NULLIF(au.raw_user_meta_data ->> 'full_name', ''), NULLIF(split_part(COALESCE(au.email, ''), '@', 1), ''), 'Profil belum lengkap') AS full_name,
      COALESCE(NULLIF(p.email, ''), au.email, '') AS email,
      COALESCE(NULLIF(p.institution, ''), NULLIF(au.raw_user_meta_data ->> 'institution', ''), 'Belum diisi') AS institution,
      p.nip_nik,
      COALESCE(p.created_at, au.created_at) AS created_at,
      a.pre_score,
      a.post_score,
      CASE
        WHEN a.post_score >= t.passing_score THEN 'Lulus'
        WHEN a.post_score IS NOT NULL THEN 'Belum Lulus'
        WHEN a.pre_score IS NOT NULL THEN 'Sedang Mengikuti'
        ELSE 'Belum Mulai'
      END AS status,
      c.certificate_number
    FROM activity x
    LEFT JOIN public.profiles p ON p.id = x.user_id
    LEFT JOIN auth.users au ON au.id = x.user_id
    JOIN public.trainings t ON t.id = p_training_id
    LEFT JOIN attempt_stats a ON a.user_id = x.user_id
    LEFT JOIN public.certificates c ON c.user_id = x.user_id AND c.training_id = p_training_id
    WHERE p.role = 'peserta' OR p.id IS NULL
  )
  SELECT r.*, COUNT(*) OVER() AS total_count
  FROM rows r
  WHERE private.is_lms_admin(auth.uid())
    AND (COALESCE(p_search, '') = '' OR r.full_name ILIKE '%' || p_search || '%'
      OR r.email ILIKE '%' || p_search || '%' OR r.institution ILIKE '%' || p_search || '%')
    AND (p_status = 'all'
      OR (p_status = 'passed' AND r.status = 'Lulus')
      OR (p_status = 'failed' AND r.status = 'Belum Lulus')
      OR (p_status = 'in_progress' AND r.status = 'Sedang Mengikuti')
      OR (p_status = 'not_started' AND r.status = 'Belum Mulai'))
  ORDER BY r.full_name
  LIMIT LEAST(GREATEST(p_limit, 1), 10000)
  OFFSET GREATEST(p_offset, 0);
$$;

-- Satu peserta satu baris dan filter hasil tes dihitung di database.
CREATE OR REPLACE FUNCTION public.admin_training_results(
  p_training_id UUID,
  p_search TEXT DEFAULT '',
  p_test_filter TEXT DEFAULT 'all',
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  pre_score NUMERIC,
  best_post_score NUMERIC,
  post_attempts BIGINT,
  status TEXT,
  last_submitted_at TIMESTAMPTZ,
  total_count BIGINT,
  all_count BIGINT,
  pre_count BIGINT,
  post_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH grouped AS (
    SELECT
      a.user_id,
      COALESCE(NULLIF(p.full_name, ''), NULLIF(au.raw_user_meta_data ->> 'full_name', ''), NULLIF(split_part(COALESCE(au.email, ''), '@', 1), ''), 'Peserta') AS full_name,
      COALESCE(NULLIF(p.email, ''), au.email, '') AS email,
      MAX(a.score) FILTER (WHERE a.test_type = 'pretest') AS pre_score,
      MAX(a.score) FILTER (WHERE a.test_type = 'posttest') AS best_post_score,
      COUNT(*) FILTER (WHERE a.test_type = 'posttest') AS post_attempts,
      MAX(a.submitted_at) AS last_submitted_at,
      BOOL_OR(a.test_type = 'pretest') AS has_pretest,
      BOOL_OR(a.test_type = 'posttest') AS has_posttest
    FROM public.test_attempts a
    LEFT JOIN public.profiles p ON p.id = a.user_id
    LEFT JOIN auth.users au ON au.id = a.user_id
    WHERE a.training_id = p_training_id
    GROUP BY a.user_id, p.full_name, p.email, au.raw_user_meta_data, au.email
  ), counts AS (
    SELECT COUNT(*) AS all_count,
      COUNT(*) FILTER (WHERE has_pretest) AS pre_count,
      COUNT(*) FILTER (WHERE has_posttest) AS post_count
    FROM grouped
  ), filtered AS (
    SELECT g.*
    FROM grouped g
    WHERE (COALESCE(p_search, '') = '' OR g.full_name ILIKE '%' || p_search || '%' OR g.email ILIKE '%' || p_search || '%')
      AND (p_test_filter = 'all'
        OR (p_test_filter = 'pretest' AND g.has_pretest)
        OR (p_test_filter = 'posttest' AND g.has_posttest))
  )
  SELECT
    f.user_id,
    f.full_name,
    f.email,
    f.pre_score,
    f.best_post_score,
    f.post_attempts,
    CASE
      WHEN f.best_post_score >= t.passing_score THEN 'Lulus'
      WHEN f.best_post_score IS NOT NULL THEN 'Belum Lulus'
      ELSE 'Belum Post-Test'
    END,
    f.last_submitted_at,
    COUNT(*) OVER(),
    c.all_count,
    c.pre_count,
    c.post_count
  FROM filtered f
  CROSS JOIN counts c
  JOIN public.trainings t ON t.id = p_training_id
  WHERE private.is_lms_admin(auth.uid())
  ORDER BY f.last_submitted_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

-- Materi tidak dapat diselesaikan setelah pelatihan dinonaktifkan/berakhir.
CREATE OR REPLACE FUNCTION public.complete_material_progress(p_material_id UUID)
RETURNS public.material_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_progress public.material_progress%ROWTYPE;
  v_duration INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;

  SELECT * INTO v_progress
  FROM public.material_progress
  WHERE user_id = auth.uid() AND material_id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Materi belum dimulai'; END IF;

  SELECT m.minimum_duration_seconds INTO v_duration
  FROM public.materials m
  JOIN public.trainings t ON t.id = m.training_id
  WHERE m.id = p_material_id AND m.active AND t.active
    AND (t.start_date IS NULL OR t.start_date <= now())
    AND (t.end_date IS NULL OR t.end_date >= now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Materi tidak aktif atau di luar periode pelatihan'; END IF;

  IF v_progress.completed_at IS NULL
     AND now() < v_progress.started_at + make_interval(secs => GREATEST(v_duration, 0)) THEN
    RAISE EXCEPTION 'Durasi minimum materi belum terpenuhi';
  END IF;

  UPDATE public.material_progress
  SET completed_at = COALESCE(completed_at, now())
  WHERE id = v_progress.id
  RETURNING * INTO v_progress;
  RETURN v_progress;
END;
$$;

-- Sertifikat lama tetap dapat diverifikasi walau profil peserta belum lengkap.
CREATE OR REPLACE FUNCTION public.verify_certificate(p_code TEXT)
RETURNS TABLE (
  certificate_number TEXT,
  verification_code TEXT,
  issued_at TIMESTAMPTZ,
  posttest_score NUMERIC,
  user_name TEXT,
  user_institution TEXT,
  training_title TEXT,
  training_jpl INTEGER,
  training_start_date TIMESTAMPTZ,
  training_end_date TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.certificate_number, c.verification_code, c.issued_at, c.posttest_score,
         COALESCE(NULLIF(p.full_name, ''), NULLIF(u.raw_user_meta_data ->> 'full_name', ''), NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''), 'Peserta'),
         COALESCE(NULLIF(p.institution, ''), NULLIF(u.raw_user_meta_data ->> 'institution', ''), 'Belum diisi'),
         t.title, t.jpl, t.start_date, t.end_date
  FROM public.certificates c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  LEFT JOIN auth.users u ON u.id = c.user_id
  JOIN public.trainings t ON t.id = c.training_id
  WHERE c.verification_code = upper(trim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.admin_training_participants(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_training_results(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_material_progress(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_training_participants(UUID, TEXT, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_training_results(UUID, TEXT, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_material_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
