-- Optimasi panel admin: filter, statistik, dan pagination dikerjakan di database.
-- Jalankan satu kali di Supabase SQL Editor setelah security_hardening.sql.

BEGIN;

CREATE INDEX IF NOT EXISTS test_attempts_training_submitted_idx
  ON public.test_attempts (training_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS certificates_training_issued_idx
  ON public.certificates (training_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS material_progress_material_user_idx
  ON public.material_progress (material_id, user_id);
CREATE INDEX IF NOT EXISTS profiles_role_name_idx
  ON public.profiles (role, full_name);

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
      p.id AS user_id, p.full_name, p.email, p.institution, p.nip_nik, p.created_at,
      a.pre_score, a.post_score,
      CASE
        WHEN a.post_score >= t.passing_score THEN 'Lulus'
        WHEN a.post_score IS NOT NULL THEN 'Belum Lulus'
        WHEN a.pre_score IS NOT NULL THEN 'Sedang Mengikuti'
        ELSE 'Belum Mulai'
      END AS status,
      c.certificate_number
    FROM activity x
    JOIN public.profiles p ON p.id = x.user_id AND p.role = 'peserta'
    JOIN public.trainings t ON t.id = p_training_id
    LEFT JOIN attempt_stats a ON a.user_id = p.id
    LEFT JOIN public.certificates c ON c.user_id = p.id AND c.training_id = p_training_id
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

CREATE OR REPLACE FUNCTION public.admin_training_stats(p_training_id UUID)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH tr AS (
    SELECT passing_score FROM public.trainings WHERE id = p_training_id
  ), active_users AS (
    SELECT user_id FROM public.test_attempts WHERE training_id = p_training_id
    UNION SELECT user_id FROM public.certificates WHERE training_id = p_training_id
    UNION SELECT mp.user_id FROM public.material_progress mp JOIN public.materials m ON m.id = mp.material_id WHERE m.training_id = p_training_id
  ), pre AS (
    SELECT COUNT(DISTINCT user_id) n FROM public.test_attempts WHERE training_id = p_training_id AND test_type = 'pretest'
  ), post AS (
    SELECT COUNT(DISTINCT user_id) n FROM public.test_attempts WHERE training_id = p_training_id AND test_type = 'posttest'
  ), passed AS (
    SELECT COUNT(DISTINCT a.user_id) n FROM public.test_attempts a, tr
    WHERE a.training_id = p_training_id AND a.test_type = 'posttest' AND a.score >= tr.passing_score
  ), material_totals AS (
    SELECT COUNT(*) n FROM public.materials WHERE training_id = p_training_id AND active
  ), completed AS (
    SELECT COUNT(*) n FROM (
      SELECT mp.user_id
      FROM public.material_progress mp
      JOIN public.materials m ON m.id = mp.material_id AND m.training_id = p_training_id AND m.active
      WHERE mp.completed_at IS NOT NULL
      GROUP BY mp.user_id
      HAVING COUNT(DISTINCT mp.material_id) >= (SELECT n FROM material_totals) AND (SELECT n FROM material_totals) > 0
    ) x
  )
  SELECT jsonb_build_object(
    'totalParticipants', (SELECT COUNT(*) FROM active_users),
    'completedPretest', (SELECT n FROM pre),
    'completedAllMaterials', (SELECT n FROM completed),
    'inProgressMaterials', GREATEST((SELECT n FROM pre) - (SELECT n FROM completed), 0),
    'completedPosttest', (SELECT n FROM post),
    'passed', (SELECT n FROM passed),
    'failed', GREATEST((SELECT n FROM post) - (SELECT n FROM passed), 0),
    'certificatesIssued', (SELECT COUNT(*) FROM public.certificates WHERE training_id = p_training_id)
  )
  WHERE private.is_lms_admin(auth.uid());
$$;

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
      p.full_name,
      p.email,
      MAX(a.score) FILTER (WHERE a.test_type = 'pretest') AS pre_score,
      MAX(a.score) FILTER (WHERE a.test_type = 'posttest') AS best_post_score,
      COUNT(*) FILTER (WHERE a.test_type = 'posttest') AS post_attempts,
      MAX(a.submitted_at) AS last_submitted_at,
      BOOL_OR(a.test_type = 'pretest') AS has_pretest,
      BOOL_OR(a.test_type = 'posttest') AS has_posttest
    FROM public.test_attempts a
    JOIN public.profiles p ON p.id = a.user_id AND p.role = 'peserta'
    WHERE a.training_id = p_training_id
    GROUP BY a.user_id, p.full_name, p.email
  ), counts AS (
    SELECT COUNT(*) AS all_count,
      COUNT(*) FILTER (WHERE has_pretest) AS pre_count,
      COUNT(*) FILTER (WHERE has_posttest) AS post_count
    FROM grouped
  ), filtered AS (
    SELECT g.*
    FROM grouped g
    WHERE (COALESCE(p_search, '') = '' OR g.full_name ILIKE '%' || p_search || '%' OR g.email ILIKE '%' || p_search || '%')
      AND (p_test_filter = 'all' OR (p_test_filter = 'pretest' AND g.has_pretest) OR (p_test_filter = 'posttest' AND g.has_posttest))
  )
  SELECT
    f.user_id, f.full_name, f.email, f.pre_score, f.best_post_score, f.post_attempts,
    CASE
      WHEN f.best_post_score >= t.passing_score THEN 'Lulus'
      WHEN f.best_post_score IS NOT NULL THEN 'Belum Lulus'
      ELSE 'Belum Post-Test'
    END,
    f.last_submitted_at,
    COUNT(*) OVER(), c.all_count, c.pre_count, c.post_count
  FROM filtered f
  CROSS JOIN counts c
  JOIN public.trainings t ON t.id = p_training_id
  WHERE private.is_lms_admin(auth.uid())
  ORDER BY f.last_submitted_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.admin_training_participants(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_training_stats(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_training_results(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_training_participants(UUID, TEXT, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_training_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_training_results(UUID, TEXT, TEXT, INT, INT) TO authenticated;

COMMIT;
