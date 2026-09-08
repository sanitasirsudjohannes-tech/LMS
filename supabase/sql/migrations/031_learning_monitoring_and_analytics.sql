-- 031: Jalankan setelah 030_preview_duration_and_publication_guard.sql.
-- Menggantikan RPC analitik dari branch lama (030_learning_monitoring_and_analytics).
-- Aman dijalankan ulang; tidak mengubah jawaban, progres, atau sertifikat peserta.
BEGIN;

-- Satu definisi progres untuk ringkasan admin dan daftar milik peserta.
-- Fungsi private hanya dipanggil wrapper terotorisasi di bawah ini.
CREATE OR REPLACE FUNCTION private.learning_progress_rows(p_training_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(user_id UUID, pre_score NUMERIC, best_post_score NUMERIC,
  post_attempts INTEGER, completed_materials INTEGER, total_materials INTEGER,
  learning_status TEXT, last_activity_at TIMESTAMPTZ, completed BOOLEAN,
  passed BOOLEAN, has_certificate BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH attempts AS (
   SELECT a.user_id, max(a.score) FILTER (WHERE a.test_type='pretest')::NUMERIC pre,
     max(a.score) FILTER (WHERE a.test_type='posttest')::NUMERIC post,
     count(*) FILTER (WHERE a.test_type='posttest')::INTEGER tries,
     max(COALESCE(a.submitted_at,a.started_at)) last_at
   FROM public.test_attempts a WHERE a.training_id=p_training_id
     AND (p_user_id IS NULL OR a.user_id=p_user_id) GROUP BY a.user_id
 ), sessions AS (
   SELECT s.user_id, max(s.updated_at) last_at,
     bool_or(s.status='in_progress' AND s.test_type='pretest') pre_open,
     bool_or(s.status='in_progress' AND s.test_type='posttest') post_open
   FROM public.test_sessions s WHERE s.training_id=p_training_id
     AND (p_user_id IS NULL OR s.user_id=p_user_id) GROUP BY s.user_id
 ), materials AS (
   SELECT mp.user_id, count(*) FILTER (WHERE mp.completed_at IS NOT NULL)::INTEGER done,
     max(GREATEST(mp.started_at,mp.completed_at)) last_at
   FROM public.material_progress mp JOIN public.materials m ON m.id=mp.material_id
   WHERE m.training_id=p_training_id AND m.active
     AND (p_user_id IS NULL OR mp.user_id=p_user_id) GROUP BY mp.user_id
 ), reviews AS (
   SELECT r.user_id, max(r.created_at) last_at FROM public.training_reviews r
   WHERE r.training_id=p_training_id AND (p_user_id IS NULL OR r.user_id=p_user_id) GROUP BY r.user_id
 ), certs AS (
   SELECT c.user_id, max(c.issued_at) last_at FROM public.certificates c
   WHERE c.training_id=p_training_id AND c.user_id IS NOT NULL
     AND (p_user_id IS NULL OR c.user_id=p_user_id) GROUP BY c.user_id
 ), users AS (
   SELECT a.user_id FROM attempts a UNION SELECT s.user_id FROM sessions s
   UNION SELECT m.user_id FROM materials m UNION SELECT r.user_id FROM reviews r
   UNION SELECT c.user_id FROM certs c
 ), base AS (
   SELECT u.user_id,a.pre,a.post,COALESCE(a.tries,0) tries,COALESCE(m.done,0) done,n.total,
     COALESCE(a.post>=t.passing_score,false) passed,c.user_id IS NOT NULL cert,
     (c.user_id IS NOT NULL OR (a.pre IS NOT NULL AND COALESCE(m.done,0)>=n.total
       AND COALESCE(a.post>=t.passing_score,false) AND r.user_id IS NOT NULL)) complete,
     s.pre_open,s.post_open,m.user_id IS NOT NULL material_started,
     GREATEST(a.last_at,s.last_at,m.last_at,r.last_at,c.last_at) last_at
   FROM users u JOIN public.trainings t ON t.id=p_training_id
   CROSS JOIN (SELECT count(*)::INTEGER total FROM public.materials x WHERE x.training_id=p_training_id AND x.active) n
   LEFT JOIN attempts a ON a.user_id=u.user_id LEFT JOIN sessions s ON s.user_id=u.user_id
   LEFT JOIN materials m ON m.user_id=u.user_id LEFT JOIN reviews r ON r.user_id=u.user_id
   LEFT JOIN certs c ON c.user_id=u.user_id
 )
 SELECT b.user_id,b.pre,b.post,b.tries,b.done,b.total,
   CASE WHEN b.complete THEN 'Selesai'
     WHEN b.passed THEN 'Menunggu Review'
     WHEN b.post_open THEN 'Sedang Post-Test'
     WHEN b.post IS NOT NULL THEN 'Belum Lulus'
     WHEN b.pre_open THEN 'Sedang Pre-Test'
     WHEN b.pre IS NOT NULL AND b.done>=b.total THEN 'Siap Post-Test'
     WHEN b.material_started THEN 'Sedang Materi'
     WHEN b.pre IS NOT NULL THEN 'Pre-Test Selesai'
     ELSE 'Belum Mulai' END,
   b.last_at,b.complete,b.passed,b.cert FROM base b;
$$;
REVOKE ALL ON FUNCTION private.learning_progress_rows(UUID,UUID) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_training_learning_summary(p_training_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result JSONB;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trainings t WHERE t.id=p_training_id) THEN RAISE EXCEPTION 'Pelatihan tidak ditemukan'; END IF;
 SELECT jsonb_build_object(
   'started',count(*),'completed',count(*) FILTER(WHERE r.completed),
   'posttest_completed',count(*) FILTER(WHERE r.best_post_score IS NOT NULL),
   'passed',count(*) FILTER(WHERE r.passed),
   'paired_count',count(*) FILTER(WHERE r.pre_score IS NOT NULL AND r.best_post_score IS NOT NULL),
   'pretest_average',round(avg(r.pre_score) FILTER(WHERE r.best_post_score IS NOT NULL),2),
   'posttest_average',round(avg(r.best_post_score) FILTER(WHERE r.pre_score IS NOT NULL),2),
   'improvement',round(avg(r.best_post_score-r.pre_score),2)
 ) INTO v_result FROM private.learning_progress_rows(p_training_id) r;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_training_progress(p_training_id UUID,p_search TEXT DEFAULT '',p_limit INTEGER DEFAULT 20,p_offset INTEGER DEFAULT 0)
RETURNS TABLE(user_id UUID,full_name TEXT,email TEXT,pre_score NUMERIC,completed_materials INTEGER,total_materials INTEGER,
 best_post_score NUMERIC,post_attempts INTEGER,learning_status TEXT,last_activity_at TIMESTAMPTZ,total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
 RETURN QUERY SELECT r.user_id,p.full_name,p.email,r.pre_score,r.completed_materials,r.total_materials,
   r.best_post_score,r.post_attempts,r.learning_status,r.last_activity_at,count(*) OVER()
 FROM private.learning_progress_rows(p_training_id) r JOIN public.profiles p ON p.id=r.user_id
 WHERE p.full_name ILIKE '%'||COALESCE(p_search,'')||'%' OR p.email ILIKE '%'||COALESCE(p_search,'')||'%'
 ORDER BY p.full_name,r.user_id LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),100) OFFSET GREATEST(COALESCE(p_offset,0),0);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_question_analysis(p_training_id UUID)
RETURNS TABLE(question_id UUID,question TEXT,answered_count BIGINT,correct_count BIGINT,correct_percent NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
 RETURN QUERY WITH expanded AS (
   SELECT (q->>'id')::UUID qid,q->>'question' qtext,
     upper(q->>'correct_answer') correct,upper(s.answers->>(q->>'id')) answer
   FROM public.test_sessions s
   CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.question_snapshot,'[]'::jsonb)) q
   WHERE s.training_id=p_training_id AND s.test_type='posttest' AND s.status='submitted'
     AND s.submitted_at IS NOT NULL AND s.answers ? (q->>'id')
 ) SELECT e.qid,max(e.qtext),count(*),count(*) FILTER(WHERE e.answer=e.correct),
   round(100.0*count(*) FILTER(WHERE e.answer=e.correct)/NULLIF(count(*),0),1)
 FROM expanded e GROUP BY e.qid ORDER BY 5 ASC NULLS LAST,2;
END; $$;

-- Hanya metadata kartu dan progres akun sendiri; tanpa konten materi atau kunci soal.
CREATE OR REPLACE FUNCTION public.my_training_overview()
RETURNS TABLE(training JSONB,learning_status TEXT,best_post_score NUMERIC,completed_materials INTEGER,total_materials INTEGER,has_certificate BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='peserta') THEN
   RAISE EXCEPTION 'Akses hanya untuk peserta';
 END IF;
 RETURN QUERY SELECT to_jsonb(t),COALESCE(r.learning_status,'Belum Mulai'),r.best_post_score,
   COALESCE(r.completed_materials,0),COALESCE(r.total_materials,n.total),COALESCE(r.has_certificate,false)
 FROM public.trainings t
 CROSS JOIN LATERAL (SELECT count(*)::INTEGER total FROM public.materials m WHERE m.training_id=t.id AND m.active) n
 LEFT JOIN LATERAL private.learning_progress_rows(t.id,auth.uid()) r ON true
 WHERE t.active AND (t.start_date IS NULL OR t.start_date<=now()) AND (t.end_date IS NULL OR t.end_date>=now())
 ORDER BY t.start_date DESC NULLS LAST,t.id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_training_learning_summary(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_training_progress(UUID,TEXT,INTEGER,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_question_analysis(UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.my_training_overview() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_training_learning_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_training_progress(UUID,TEXT,INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_question_analysis(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_training_overview() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
