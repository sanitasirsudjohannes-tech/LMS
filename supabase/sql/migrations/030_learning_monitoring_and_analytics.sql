-- 030_learning_monitoring_and_analytics.sql
-- Monitoring progres, analisis Pre/Post, dan analisis kualitas soal.
-- Jalankan setelah migration 029.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_training_learning_summary(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_passing INTEGER;
  v_materials INTEGER;
  v_registered INTEGER;
  v_started INTEGER;
  v_completed INTEGER;
  v_passed INTEGER;
  v_pre_avg NUMERIC;
  v_post_avg NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
  SELECT t.passing_score INTO v_passing FROM public.trainings t WHERE t.id = p_training_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak ditemukan'; END IF;
  SELECT count(*)::INTEGER INTO v_materials FROM public.materials m WHERE m.training_id=p_training_id AND m.active;

  -- Peserta terdaftar dihitung dari enrollment bila tersedia melalui participant RPC lama.
  -- Agar migration aman lintas instalasi, ringkasan utama memakai profil peserta yang sudah memiliki aktivitas pelatihan.
  WITH users AS (
    SELECT DISTINCT x.user_id FROM (
      SELECT a.user_id FROM public.test_attempts a WHERE a.training_id=p_training_id
      UNION ALL
      SELECT s.user_id FROM public.test_sessions s WHERE s.training_id=p_training_id
      UNION ALL
      SELECT mp.user_id FROM public.material_progress mp JOIN public.materials m ON m.id=mp.material_id WHERE m.training_id=p_training_id
    ) x
  ) SELECT count(*)::INTEGER INTO v_started FROM users;
  v_registered := v_started;

  WITH best AS (
    SELECT a.user_id,
      max(a.score) FILTER (WHERE a.test_type='pretest') AS pre,
      max(a.score) FILTER (WHERE a.test_type='posttest') AS post
    FROM public.test_attempts a WHERE a.training_id=p_training_id GROUP BY a.user_id
  )
  SELECT
    count(*) FILTER (WHERE post IS NOT NULL)::INTEGER,
    count(*) FILTER (WHERE post >= v_passing)::INTEGER,
    round(avg(pre)::numeric,2), round(avg(post)::numeric,2)
  INTO v_completed,v_passed,v_pre_avg,v_post_avg FROM best;

  RETURN jsonb_build_object(
    'registered',COALESCE(v_registered,0),'started',COALESCE(v_started,0),
    'completed',COALESCE(v_completed,0),'passed',COALESCE(v_passed,0),
    'pretest_average',COALESCE(v_pre_avg,0),'posttest_average',COALESCE(v_post_avg,0),
    'improvement',round((COALESCE(v_post_avg,0)-COALESCE(v_pre_avg,0))::numeric,2),
    'material_count',COALESCE(v_materials,0),'passing_score',v_passing
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_training_learning_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_training_learning_summary(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_training_progress(
  p_training_id UUID,
  p_search TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  user_id UUID, full_name TEXT, email TEXT, pre_score NUMERIC,
  completed_materials INTEGER, total_materials INTEGER,
  best_post_score NUMERIC, post_attempts INTEGER, learning_status TEXT,
  last_activity_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
  RETURN QUERY
  WITH active_users AS (
    SELECT DISTINCT x.uid FROM (
      SELECT a.user_id uid FROM public.test_attempts a WHERE a.training_id=p_training_id
      UNION ALL SELECT s.user_id FROM public.test_sessions s WHERE s.training_id=p_training_id
      UNION ALL SELECT mp.user_id FROM public.material_progress mp JOIN public.materials m ON m.id=mp.material_id WHERE m.training_id=p_training_id
    ) x
  ), mats AS (
    SELECT count(*)::INTEGER n FROM public.materials m WHERE m.training_id=p_training_id AND m.active
  ), agg AS (
    SELECT u.uid,
      max(a.score) FILTER(WHERE a.test_type='pretest')::NUMERIC pre,
      max(a.score) FILTER(WHERE a.test_type='posttest')::NUMERIC post,
      count(a.id) FILTER(WHERE a.test_type='posttest')::INTEGER attempts,
      max(COALESCE(a.submitted_at,a.started_at)) last_test
    FROM active_users u LEFT JOIN public.test_attempts a ON a.user_id=u.uid AND a.training_id=p_training_id GROUP BY u.uid
  ), prog AS (
    SELECT u.uid,count(DISTINCT mp.material_id) FILTER(WHERE mp.completed_at IS NOT NULL)::INTEGER done,max(mp.completed_at) last_material
    FROM active_users u LEFT JOIN public.material_progress mp ON mp.user_id=u.uid
      LEFT JOIN public.materials m ON m.id=mp.material_id AND m.training_id=p_training_id
    WHERE m.id IS NOT NULL OR mp.material_id IS NULL GROUP BY u.uid
  ), rows AS (
    SELECT p.id uid,p.full_name,p.email,a.pre,COALESCE(g.done,0) done,mats.n total,a.post,COALESCE(a.attempts,0) attempts,
      CASE WHEN a.post >= t.passing_score THEN 'Lulus'
           WHEN a.post IS NOT NULL THEN 'Belum Lulus'
           WHEN mats.n>0 AND COALESCE(g.done,0)>=mats.n THEN 'Siap Post-Test'
           WHEN COALESCE(g.done,0)>0 THEN 'Sedang Materi'
           WHEN a.pre IS NOT NULL THEN 'Pre-Test Selesai'
           ELSE 'Belum Mulai' END st,
      GREATEST(a.last_test,g.last_material) last_at
    FROM active_users u JOIN public.profiles p ON p.id=u.uid CROSS JOIN mats
    JOIN public.trainings t ON t.id=p_training_id LEFT JOIN agg a ON a.uid=u.uid LEFT JOIN prog g ON g.uid=u.uid
    WHERE COALESCE(p.full_name,'') ILIKE '%'||COALESCE(p_search,'')||'%' OR COALESCE(p.email,'') ILIKE '%'||COALESCE(p_search,'')||'%'
  )
  SELECT r.uid,r.full_name,r.email,r.pre,r.done,r.total,r.post,r.attempts,r.st,r.last_at,count(*) OVER()
  FROM rows r ORDER BY r.full_name,r.uid LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_training_progress(UUID,TEXT,INTEGER,INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_training_progress(UUID,TEXT,INTEGER,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_question_analysis(p_training_id UUID)
RETURNS TABLE(question_id UUID, question TEXT, answered_count BIGINT, correct_count BIGINT, correct_percent NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
  RETURN QUERY
  WITH sessions AS (
    SELECT s.answers,s.question_snapshot FROM public.test_sessions s
    WHERE s.training_id=p_training_id AND s.test_type='posttest' AND s.answers IS NOT NULL AND s.answers<>'{}'::jsonb
  ), expanded AS (
    SELECT (q->>'id')::UUID qid,q->>'question' qtext,upper(q->>'correct_answer') correct,upper(ans.value) answer
    FROM sessions s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.question_snapshot,'[]'::jsonb)) q
    JOIN LATERAL jsonb_each_text(s.answers) ans ON ans.key=q->>'id'
  )
  SELECT e.qid,max(e.qtext),count(*),count(*) FILTER(WHERE e.answer=e.correct),
    round((100.0*count(*) FILTER(WHERE e.answer=e.correct)/NULLIF(count(*),0))::numeric,1)
  FROM expanded e GROUP BY e.qid ORDER BY 5 ASC NULLS LAST,2;
END; $$;

REVOKE ALL ON FUNCTION public.admin_question_analysis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_question_analysis(UUID) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
