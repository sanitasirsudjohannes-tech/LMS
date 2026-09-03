-- Retensi jangka panjang: log pelatihan, statistik permanen, backup terverifikasi,
-- pembersihan data operasional, dan pemantauan ukuran database.
-- Jalankan setelah migrasi 011. Aman dijalankan ulang.

BEGIN;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operational_data_purged_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION private.sync_training_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := COALESCE(NEW.status, CASE WHEN NEW.active THEN 'active' ELSE 'draft' END);
  ELSE
    IF OLD.operational_data_purged_at IS NOT NULL AND NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'Pelatihan yang datanya sudah dibersihkan harus tetap berstatus Arsip';
    END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.active IS DISTINCT FROM OLD.active THEN
      NEW.status := CASE WHEN NEW.active THEN 'active' ELSE 'archived' END;
    END IF;
  END IF;
  NEW.active := NEW.status = 'active';
  NEW.archived_at := CASE
    WHEN NEW.status = 'archived' THEN COALESCE(NEW.archived_at, now())
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.training_summaries (
  training_id UUID PRIMARY KEY REFERENCES public.trainings(id) ON DELETE CASCADE,
  participant_count BIGINT NOT NULL DEFAULT 0,
  pretest_count BIGINT NOT NULL DEFAULT 0,
  posttest_count BIGINT NOT NULL DEFAULT 0,
  passed_count BIGINT NOT NULL DEFAULT 0,
  failed_count BIGINT NOT NULL DEFAULT 0,
  certificate_count BIGINT NOT NULL DEFAULT 0,
  posttest_attempt_count BIGINT NOT NULL DEFAULT 0,
  average_pretest_score NUMERIC,
  average_posttest_score NUMERIC,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT NOT NULL,
  record_counts JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS training_backups_training_created_idx
  ON public.training_backups (training_id, created_at DESC);

ALTER TABLE public.training_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.training_summaries, public.training_backups FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.capture_training_summary(p_training_id UUID)
RETURNS public.training_summaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_summary public.training_summaries%ROWTYPE;
BEGIN
  INSERT INTO public.training_summaries (
    training_id, participant_count, pretest_count, posttest_count,
    passed_count, failed_count, certificate_count, posttest_attempt_count,
    average_pretest_score, average_posttest_score, captured_at
  )
  WITH participant_ids AS (
    SELECT user_id FROM public.test_attempts WHERE training_id = p_training_id
    UNION
    SELECT user_id FROM public.test_sessions WHERE training_id = p_training_id
    UNION
    SELECT user_id FROM public.certificates WHERE training_id = p_training_id AND user_id IS NOT NULL
    UNION
    SELECT mp.user_id
    FROM public.material_progress mp
    JOIN public.materials m ON m.id = mp.material_id
    WHERE m.training_id = p_training_id
  ), per_user AS (
    SELECT
      a.user_id,
      MAX(a.score) FILTER (WHERE a.test_type = 'pretest') AS pre_score,
      MAX(a.score) FILTER (WHERE a.test_type = 'posttest') AS best_post_score
    FROM public.test_attempts a
    WHERE a.training_id = p_training_id
    GROUP BY a.user_id
  ), tr AS (
    SELECT passing_score FROM public.trainings WHERE id = p_training_id
  )
  SELECT
    p_training_id,
    (SELECT count(*) FROM participant_ids),
    (SELECT count(*) FROM per_user WHERE pre_score IS NOT NULL),
    (SELECT count(*) FROM per_user WHERE best_post_score IS NOT NULL),
    (SELECT count(*) FROM per_user, tr WHERE best_post_score >= tr.passing_score),
    (SELECT count(*) FROM per_user, tr WHERE best_post_score IS NOT NULL AND best_post_score < tr.passing_score),
    (SELECT count(*) FROM public.certificates WHERE training_id = p_training_id),
    (SELECT count(*) FROM public.test_attempts WHERE training_id = p_training_id AND test_type = 'posttest'),
    (SELECT round(avg(pre_score), 2) FROM per_user WHERE pre_score IS NOT NULL),
    (SELECT round(avg(best_post_score), 2) FROM per_user WHERE best_post_score IS NOT NULL),
    now()
  ON CONFLICT (training_id) DO UPDATE SET
    participant_count = EXCLUDED.participant_count,
    pretest_count = EXCLUDED.pretest_count,
    posttest_count = EXCLUDED.posttest_count,
    passed_count = EXCLUDED.passed_count,
    failed_count = EXCLUDED.failed_count,
    certificate_count = EXCLUDED.certificate_count,
    posttest_attempt_count = EXCLUDED.posttest_attempt_count,
    average_pretest_score = EXCLUDED.average_pretest_score,
    average_posttest_score = EXCLUDED.average_posttest_score,
    captured_at = EXCLUDED.captured_at
  RETURNING * INTO v_summary;
  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_training_summary(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.protect_training_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Hanya pelatihan Draf yang dapat dihapus permanen. Arsipkan pelatihan yang sudah digunakan.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.test_attempts WHERE training_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.test_sessions WHERE training_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.certificates WHERE training_id = OLD.id)
     OR EXISTS (
       SELECT 1 FROM public.material_progress mp
       JOIN public.materials m ON m.id = mp.material_id
       WHERE m.training_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'Pelatihan memiliki aktivitas peserta dan tidak dapat dihapus permanen.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trainings_protect_history_before_delete ON public.trainings;
CREATE TRIGGER trainings_protect_history_before_delete
BEFORE DELETE ON public.trainings
FOR EACH ROW EXECUTE FUNCTION private.protect_training_history();
REVOKE ALL ON FUNCTION private.protect_training_history() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_archive_training(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_summary public.training_summaries%ROWTYPE;
BEGIN
  IF NOT private.is_lms_admin(auth.uid()) THEN RAISE EXCEPTION 'Akses admin diperlukan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainings WHERE id = p_training_id) THEN RAISE EXCEPTION 'Pelatihan tidak ditemukan'; END IF;
  v_summary := private.capture_training_summary(p_training_id);
  UPDATE public.trainings
  SET status = 'archived', active = FALSE, archived_at = COALESCE(archived_at, now())
  WHERE id = p_training_id;
  RETURN jsonb_build_object('status', 'archived', 'summary', to_jsonb(v_summary));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_export_training_backup(p_training_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload JSONB;
  v_counts JSONB;
  v_checksum TEXT;
  v_backup_id UUID;
  v_summary public.training_summaries%ROWTYPE;
BEGIN
  IF NOT private.is_lms_admin(auth.uid()) THEN RAISE EXCEPTION 'Akses admin diperlukan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainings WHERE id = p_training_id) THEN RAISE EXCEPTION 'Pelatihan tidak ditemukan'; END IF;

  v_summary := private.capture_training_summary(p_training_id);
  v_counts := jsonb_build_object(
    'materials', (SELECT count(*) FROM public.materials WHERE training_id = p_training_id),
    'questions', (SELECT count(*) FROM public.questions WHERE training_id = p_training_id),
    'attempts', (SELECT count(*) FROM public.test_attempts WHERE training_id = p_training_id),
    'sessions', (SELECT count(*) FROM public.test_sessions WHERE training_id = p_training_id),
    'progress', (SELECT count(*) FROM public.material_progress mp JOIN public.materials m ON m.id = mp.material_id WHERE m.training_id = p_training_id),
    'certificates', (SELECT count(*) FROM public.certificates WHERE training_id = p_training_id)
  );

  v_payload := jsonb_build_object(
    'format', 'LONTAR_TRAINING_BACKUP',
    'version', 1,
    'exported_at', now(),
    'training', (SELECT to_jsonb(t) FROM public.trainings t WHERE t.id = p_training_id),
    'summary', to_jsonb(v_summary),
    'certificate_settings', COALESCE((SELECT to_jsonb(cs) FROM public.certificate_settings cs WHERE cs.training_id = p_training_id), 'null'::JSONB),
    'participants', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.id IN (
        SELECT user_id FROM public.test_attempts WHERE training_id = p_training_id
        UNION SELECT user_id FROM public.test_sessions WHERE training_id = p_training_id
        UNION SELECT user_id FROM public.certificates WHERE training_id = p_training_id AND user_id IS NOT NULL
        UNION SELECT mp.user_id FROM public.material_progress mp JOIN public.materials m ON m.id = mp.material_id WHERE m.training_id = p_training_id
      )
    ), '[]'::JSONB),
    'materials', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.order_number, m.id) FROM public.materials m WHERE m.training_id = p_training_id), '[]'::JSONB),
    'questions', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.test_type, q.id) FROM public.questions q WHERE q.training_id = p_training_id), '[]'::JSONB),
    'test_attempts', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.submitted_at, a.id) FROM public.test_attempts a WHERE a.training_id = p_training_id), '[]'::JSONB),
    'test_sessions', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.started_at, s.id) FROM public.test_sessions s WHERE s.training_id = p_training_id), '[]'::JSONB),
    'material_progress', COALESCE((SELECT jsonb_agg(to_jsonb(mp) ORDER BY mp.started_at, mp.id) FROM public.material_progress mp JOIN public.materials m ON m.id = mp.material_id WHERE m.training_id = p_training_id), '[]'::JSONB),
    'certificates', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.issued_at, c.id) FROM public.certificates c WHERE c.training_id = p_training_id), '[]'::JSONB),
    'record_counts', v_counts
  );
  v_checksum := md5(v_payload::TEXT);

  INSERT INTO public.training_backups (training_id, created_by, checksum, record_counts)
  VALUES (p_training_id, auth.uid(), v_checksum, v_counts)
  RETURNING id INTO v_backup_id;

  RETURN v_payload || jsonb_build_object('backup_id', v_backup_id, 'checksum', v_checksum);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_purge_archived_training(
  p_training_id UUID,
  p_backup_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_training public.trainings%ROWTYPE;
  v_sessions BIGINT;
  v_attempts BIGINT;
  v_progress BIGINT;
  v_questions BIGINT;
  v_materials BIGINT;
BEGIN
  IF NOT private.is_lms_admin(auth.uid()) THEN RAISE EXCEPTION 'Akses admin diperlukan'; END IF;
  SELECT * INTO v_training FROM public.trainings WHERE id = p_training_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak ditemukan'; END IF;
  IF v_training.status <> 'archived' THEN RAISE EXCEPTION 'Pelatihan harus diarsipkan terlebih dahulu'; END IF;
  IF v_training.operational_data_purged_at IS NOT NULL THEN RAISE EXCEPTION 'Data operasional sudah pernah dibersihkan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.training_backups WHERE id = p_backup_id AND training_id = p_training_id) THEN
    RAISE EXCEPTION 'Backup pelatihan yang valid diperlukan sebelum pembersihan';
  END IF;

  PERFORM private.capture_training_summary(p_training_id);

  WITH deleted AS (DELETE FROM public.test_sessions WHERE training_id = p_training_id RETURNING 1)
  SELECT count(*) INTO v_sessions FROM deleted;
  WITH deleted AS (DELETE FROM public.test_attempts WHERE training_id = p_training_id RETURNING 1)
  SELECT count(*) INTO v_attempts FROM deleted;
  WITH deleted AS (
    DELETE FROM public.material_progress mp
    USING public.materials m
    WHERE mp.material_id = m.id AND m.training_id = p_training_id
    RETURNING 1
  ) SELECT count(*) INTO v_progress FROM deleted;
  WITH deleted AS (DELETE FROM public.questions WHERE training_id = p_training_id RETURNING 1)
  SELECT count(*) INTO v_questions FROM deleted;
  WITH deleted AS (DELETE FROM public.materials WHERE training_id = p_training_id RETURNING 1)
  SELECT count(*) INTO v_materials FROM deleted;

  UPDATE public.trainings SET operational_data_purged_at = now() WHERE id = p_training_id;
  RETURN jsonb_build_object(
    'status', 'purged', 'sessions', v_sessions, 'attempts', v_attempts,
    'progress', v_progress, 'questions', v_questions, 'materials', v_materials
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_training_maintenance_list()
RETURNS TABLE (
  training_id UUID,
  archived_at TIMESTAMPTZ,
  operational_data_purged_at TIMESTAMPTZ,
  last_backup_id UUID,
  last_backup_at TIMESTAMPTZ,
  participant_count BIGINT,
  attempt_count BIGINT,
  session_count BIGINT,
  certificate_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.id, t.archived_at, t.operational_data_purged_at,
         b.id, b.created_at,
         COALESCE(s.participant_count, live.participant_count, 0),
         CASE
           WHEN t.operational_data_purged_at IS NOT NULL
             THEN COALESCE(s.pretest_count + s.posttest_attempt_count, 0)
           ELSE COALESCE(live.attempt_count, 0)
         END,
         COALESCE(live.session_count, 0),
         COALESCE(s.certificate_count, live.certificate_count, 0)
  FROM public.trainings t
  LEFT JOIN public.training_summaries s ON s.training_id = t.id
  LEFT JOIN LATERAL (
    SELECT tb.id, tb.created_at FROM public.training_backups tb
    WHERE tb.training_id = t.id ORDER BY tb.created_at DESC LIMIT 1
  ) b ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      (SELECT count(DISTINCT a.user_id) FROM public.test_attempts a WHERE a.training_id = t.id) AS participant_count,
      (SELECT count(*) FROM public.test_attempts a WHERE a.training_id = t.id) AS attempt_count,
      (SELECT count(*) FROM public.test_sessions ts WHERE ts.training_id = t.id) AS session_count,
      (SELECT count(*) FROM public.certificates c WHERE c.training_id = t.id) AS certificate_count
  ) live ON TRUE
  WHERE private.is_lms_admin(auth.uid())
  ORDER BY t.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_database_usage()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN private.is_lms_admin(auth.uid()) THEN jsonb_build_object(
    'bytes', pg_database_size(current_database()),
    'megabytes', round(pg_database_size(current_database())::NUMERIC / 1048576, 2),
    'free_plan_limit_megabytes', 500,
    'safe_limit_megabytes', 400,
    'safe_usage_percent', round((pg_database_size(current_database())::NUMERIC / (400 * 1048576)) * 100, 2)
  ) ELSE NULL END;
$$;

REVOKE ALL ON FUNCTION public.admin_archive_training(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_export_training_backup(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_purge_archived_training(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_training_maintenance_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_database_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_training(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_training_backup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_archived_training(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_training_maintenance_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_database_usage() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
