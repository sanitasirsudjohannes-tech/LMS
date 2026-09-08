-- 032: Jalankan setelah 031. Monitoring lengkap, timeline, dan resume lintas perangkat.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_training_monitoring(p_training_id UUID,p_search TEXT DEFAULT '',p_status TEXT DEFAULT 'all',p_limit INTEGER DEFAULT 20,p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v JSONB;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
 IF p_status NOT IN ('all','not_started','studying','completed','passed','failed') THEN RAISE EXCEPTION 'Filter tidak valid'; END IF;
 WITH base AS (
  SELECT p.id user_id,p.full_name,p.email,r.pre_score,r.best_post_score,COALESCE(r.post_attempts,0) post_attempts,
   COALESCE(r.completed_materials,0) completed_materials,COALESCE(r.total_materials,n.total) total_materials,
   COALESCE(r.learning_status,'Belum Mulai') learning_status,r.last_activity_at,COALESCE(r.completed,false) completed,
   COALESCE(r.passed,false) passed,COALESCE(r.has_certificate,false) has_certificate,r.user_id IS NOT NULL started
  FROM public.profiles p CROSS JOIN (SELECT count(*)::INTEGER total FROM public.materials m WHERE m.training_id=p_training_id AND m.active) n
  LEFT JOIN private.learning_progress_rows(p_training_id) r ON r.user_id=p.id WHERE p.role='peserta'
 ), filtered AS (
  SELECT * FROM base b WHERE (b.full_name ILIKE '%'||COALESCE(p_search,'')||'%' OR b.email ILIKE '%'||COALESCE(p_search,'')||'%')
   AND (p_status='all' OR (p_status='not_started' AND NOT b.started) OR (p_status='studying' AND b.started AND NOT b.completed)
    OR (p_status='completed' AND b.completed) OR (p_status='passed' AND b.passed)
    OR (p_status='failed' AND b.best_post_score IS NOT NULL AND NOT b.passed))
 ), page AS (SELECT * FROM filtered ORDER BY full_name,user_id LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),100) OFFSET GREATEST(COALESCE(p_offset,0),0))
 SELECT jsonb_build_object('summary',(SELECT jsonb_build_object('registered',count(*),'not_started',count(*) FILTER(WHERE NOT started),
  'studying',count(*) FILTER(WHERE started AND NOT completed),'completed',count(*) FILTER(WHERE completed),'passed',count(*) FILTER(WHERE passed),
  'failed',count(*) FILTER(WHERE best_post_score IS NOT NULL AND NOT passed)) FROM base),'total_count',(SELECT count(*) FROM filtered),
  'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY full_name,user_id) FROM page),'[]'::jsonb)) INTO v;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.admin_participant_timeline(p_training_id UUID,p_user_id UUID)
RETURNS TABLE(event_at TIMESTAMPTZ,event_type TEXT,label TEXT) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN RAISE EXCEPTION 'Akses hanya untuk admin'; END IF;
 RETURN QUERY WITH events AS (
  SELECT s.started_at ts,'test_started'::TEXT kind,('Mulai '||CASE WHEN s.test_type='pretest' THEN 'Pre-Test' ELSE 'Post-Test' END||' (percobaan '||s.attempt_number||')')::TEXT detail FROM public.test_sessions s WHERE s.training_id=p_training_id AND s.user_id=p_user_id
  UNION ALL SELECT a.submitted_at,'test_submitted',(CASE WHEN a.test_type='pretest' THEN 'Pre-Test' ELSE 'Post-Test' END||' dikirim • Nilai '||a.score||' • Percobaan '||a.attempt_number) FROM public.test_attempts a WHERE a.training_id=p_training_id AND a.user_id=p_user_id
  UNION ALL SELECT mp.started_at,'material_started','Mulai materi: '||m.title FROM public.material_progress mp JOIN public.materials m ON m.id=mp.material_id WHERE m.training_id=p_training_id AND mp.user_id=p_user_id
  UNION ALL SELECT mp.completed_at,'material_completed','Selesai materi: '||m.title FROM public.material_progress mp JOIN public.materials m ON m.id=mp.material_id WHERE m.training_id=p_training_id AND mp.user_id=p_user_id AND mp.completed_at IS NOT NULL
  UNION ALL SELECT min(a.submitted_at),'passed','Lulus Post-Test' FROM public.test_attempts a JOIN public.trainings t ON t.id=a.training_id WHERE a.training_id=p_training_id AND a.user_id=p_user_id AND a.test_type='posttest' AND a.score>=t.passing_score
  UNION ALL SELECT r.created_at,'review','Review pelatihan dikirim' FROM public.training_reviews r WHERE r.training_id=p_training_id AND r.user_id=p_user_id
  UNION ALL SELECT c.issued_at,'certificate','Sertifikat diterbitkan'||COALESCE(' • '||c.certificate_number,'') FROM public.certificates c WHERE c.training_id=p_training_id AND c.user_id=p_user_id
 ) SELECT e.ts,e.kind,e.detail FROM events e WHERE e.ts IS NOT NULL ORDER BY e.ts,e.kind,e.detail;
END $$;

CREATE OR REPLACE FUNCTION public.my_learning_resume(p_training_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.trainings%ROWTYPE; r RECORD; material_id UUID; certificate_id UUID;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='peserta') THEN RAISE EXCEPTION 'Akses hanya untuk peserta'; END IF;
 SELECT x.* INTO t FROM public.trainings x LEFT JOIN LATERAL private.learning_progress_rows(x.id,auth.uid()) p ON true
 WHERE x.active AND (x.start_date IS NULL OR x.start_date<=now()) AND (x.end_date IS NULL OR x.end_date>=now()) AND (p_training_id IS NULL OR x.id=p_training_id)
 AND (p_training_id IS NOT NULL OR p.user_id IS NOT NULL) ORDER BY p.last_activity_at DESC NULLS LAST,x.id LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('path','/trainings'); END IF;
 SELECT * INTO r FROM private.learning_progress_rows(t.id,auth.uid());
 SELECT c.id INTO certificate_id FROM public.certificates c WHERE c.training_id=t.id AND c.user_id=auth.uid() ORDER BY c.issued_at DESC LIMIT 1;
 IF certificate_id IS NOT NULL THEN RETURN jsonb_build_object('training_id',t.id,'path','/certificate','certificate_id',certificate_id); END IF;
 IF r.pre_score IS NULL THEN RETURN jsonb_build_object('training_id',t.id,'path','/pretest'); END IF;
 SELECT m.id INTO material_id FROM public.materials m WHERE m.training_id=t.id AND m.active AND NOT EXISTS(SELECT 1 FROM public.material_progress mp WHERE mp.material_id=m.id AND mp.user_id=auth.uid() AND mp.completed_at IS NOT NULL) ORDER BY m.order_number,m.id LIMIT 1;
 IF material_id IS NOT NULL THEN RETURN jsonb_build_object('training_id',t.id,'path','/material/'||material_id); END IF;
 IF NOT COALESCE(r.passed,false) AND t.posttest_start_at>now() THEN RETURN jsonb_build_object('training_id',t.id,'path','/dashboard'); END IF;
 RETURN jsonb_build_object('training_id',t.id,'path','/posttest');
END $$;

REVOKE ALL ON FUNCTION public.admin_training_monitoring(UUID,TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_participant_timeline(UUID,UUID) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.my_learning_resume(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_training_monitoring(UUID,TEXT,TEXT,INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_participant_timeline(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_learning_resume(UUID) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
