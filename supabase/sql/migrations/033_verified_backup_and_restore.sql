-- 033: Backup ZIP v2, purge requiring the uploaded snapshot, atomic same-project restore.
-- Apply after 032. Old backup IDs alone can no longer authorize deletion.
BEGIN;
ALTER TABLE public.trainings ADD COLUMN IF NOT EXISTS purged_backup_id UUID;
ALTER TABLE public.training_backups ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.training_backups ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;

-- Rare maintenance operations serialize with writes. Readers remain available.
-- Bounded lock waiting makes a busy database fail safely without deleting anything.
CREATE OR REPLACE FUNCTION private.lock_training_backup_tables() RETURNS VOID
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 LOCK TABLE public.trainings, public.materials, public.questions, public.test_sessions,
   public.test_attempts, public.material_progress IN SHARE ROW EXCLUSIVE MODE;
END $$;
REVOKE ALL ON FUNCTION private.lock_training_backup_tables() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.training_operational_snapshot(p_id UUID) RETURNS JSONB
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
 'materials',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.materials x WHERE training_id=p_id),'[]'::jsonb),
 'questions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.questions x WHERE training_id=p_id),'[]'::jsonb),
 'test_sessions',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.test_sessions x WHERE training_id=p_id),'[]'::jsonb),
 'test_attempts',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.test_attempts x WHERE training_id=p_id),'[]'::jsonb),
 'material_progress',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.material_progress x JOIN public.materials m ON m.id=x.material_id WHERE m.training_id=p_id),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION private.training_operational_snapshot(UUID) FROM PUBLIC,anon,authenticated;

-- JSON round trips through JavaScript remove numeric trailing zeros. Normalize
-- numeric scale before hashing, without changing timestamps or string values.
CREATE OR REPLACE FUNCTION private.canonical_backup_json(value JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result JSONB;
BEGIN
 CASE jsonb_typeof(value)
 WHEN 'number' THEN RETURN to_jsonb(trim_scale((value #>> '{}')::numeric));
 WHEN 'array' THEN
  SELECT COALESCE(jsonb_agg(private.canonical_backup_json(x) ORDER BY n),'[]'::jsonb)
  INTO result FROM jsonb_array_elements(value) WITH ORDINALITY a(x,n);
  RETURN result;
 WHEN 'object' THEN
  SELECT COALESCE(jsonb_object_agg(k,private.canonical_backup_json(v)),'{}'::jsonb)
  INTO result FROM jsonb_each(value) a(k,v);
  RETURN result;
 ELSE RETURN value;
 END CASE;
END $$;
REVOKE ALL ON FUNCTION private.canonical_backup_json(JSONB) FROM PUBLIC,anon,authenticated;

-- Keep the original JSON text across browser round trips: JavaScript numbers
-- cannot represent every PostgreSQL NUMERIC (for example repeating averages).
CREATE OR REPLACE FUNCTION private.unpack_training_backup(p_backup JSONB) RETURNS JSONB
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE payload JSONB;
BEGIN
 IF jsonb_typeof(p_backup->'payload_json') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'Backup tidak lengkap: payload asli tidak tersedia';
 END IF;
 payload := (p_backup->>'payload_json')::jsonb;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Payload backup tidak valid'; END IF;
 RETURN payload || jsonb_build_object('backup_id',p_backup->'backup_id','checksum',p_backup->'checksum');
END $$;
REVOKE ALL ON FUNCTION private.unpack_training_backup(JSONB) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.validate_training_backup(p_backup JSONB) RETURNS UUID
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.training_backups%ROWTYPE; calculated TEXT;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_lms_admin(auth.uid()) THEN RAISE EXCEPTION 'Akses admin diperlukan'; END IF;
 IF p_backup IS NULL OR p_backup->>'format' IS DISTINCT FROM 'LONTAR_TRAINING_BACKUP'
 OR p_backup->>'version' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Gunakan ZIP backup versi 2 dari aplikasi ini'; END IF;
 SELECT * INTO b FROM public.training_backups WHERE id=(p_backup->>'backup_id')::UUID;
 IF NOT FOUND OR b.training_id::TEXT IS DISTINCT FROM p_backup#>>'{training,id}' THEN
  RAISE EXCEPTION 'Backup tidak berasal dari pelatihan/database ini';
 END IF;
 calculated := encode(sha256(convert_to(private.canonical_backup_json(p_backup - 'backup_id' - 'checksum')::TEXT,'UTF8')),'hex');
 IF b.checksum IS DISTINCT FROM calculated OR p_backup->>'checksum' IS DISTINCT FROM calculated THEN
  RAISE EXCEPTION 'Isi backup berubah atau rusak';
 END IF;
 RETURN b.training_id;
END $$;
REVOKE ALL ON FUNCTION private.validate_training_backup(JSONB) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_verify_training_backup(p_backup JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE id UUID;
BEGIN
 p_backup := private.unpack_training_backup(p_backup);
 id := private.validate_training_backup(p_backup);
 UPDATE public.training_backups SET verified_at=clock_timestamp() WHERE training_backups.id=(p_backup->>'backup_id')::UUID;
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION public.admin_verify_training_backup(JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_training_backup(JSONB) TO authenticated;

-- Fail closed for old clients even before the new frontend is deployed.
CREATE OR REPLACE FUNCTION public.admin_purge_archived_training(p_training_id UUID,p_backup_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Pilih kembali ZIP backup versi 2 untuk memverifikasi sebelum pembersihan'; END $$;
REVOKE ALL ON FUNCTION public.admin_purge_archived_training(UUID,UUID) FROM PUBLIC,anon,authenticated;
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

  PERFORM private.lock_training_backup_tables();
  IF EXISTS (SELECT 1 FROM public.trainings WHERE id = p_training_id AND operational_data_purged_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Data sudah dibersihkan. Gunakan ZIP yang disimpan sebelum pembersihan.';
  END IF;
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
    'version', 2,
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
  v_payload := v_payload || private.training_operational_snapshot(p_training_id);
  v_checksum := encode(sha256(convert_to(private.canonical_backup_json(v_payload)::TEXT, 'UTF8')), 'hex');

  INSERT INTO public.training_backups (training_id, created_by, checksum, record_counts)
  VALUES (p_training_id, auth.uid(), v_checksum, v_counts)
  RETURNING id INTO v_backup_id;

  RETURN v_payload || jsonb_build_object('backup_id', v_backup_id, 'checksum', v_checksum, 'payload_json', v_payload::TEXT);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_export_training_backup(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_export_training_backup(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_purge_verified_training(p_backup JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p_training_id UUID;
  p_backup_id UUID;
  snapshot JSONB;
  key TEXT;
  v_training public.trainings%ROWTYPE;
  v_certificate_enabled BOOLEAN := FALSE;
  v_sessions BIGINT;
  v_attempts BIGINT;
  v_progress BIGINT;
  v_questions BIGINT;
  v_materials BIGINT;
  v_missing_certificates BIGINT := 0;
  v_passed RECORD;
BEGIN
  IF NOT private.is_lms_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Akses admin diperlukan';
  END IF;

  p_backup := private.unpack_training_backup(p_backup);
  p_training_id := private.validate_training_backup(p_backup);
  p_backup_id := (p_backup->>'backup_id')::UUID;
  PERFORM private.lock_training_backup_tables();
  snapshot := private.training_operational_snapshot(p_training_id);
  FOR key IN SELECT jsonb_object_keys(snapshot) LOOP
    IF snapshot->key IS DISTINCT FROM p_backup->key THEN
      RAISE EXCEPTION 'Data berubah sejak backup. Unduh backup baru sebelum pembersihan.';
    END IF;
  END LOOP;
  IF p_backup#>>'{training,status}' IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'Arsipkan pelatihan lalu buat backup baru sebelum pembersihan';
  END IF;

  SELECT * INTO v_training
  FROM public.trainings
  WHERE id = p_training_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelatihan tidak ditemukan';
  END IF;
  IF to_jsonb(v_training) IS DISTINCT FROM p_backup->'training' THEN
    RAISE EXCEPTION 'Pengaturan pelatihan berubah sejak backup. Buat backup baru.';
  END IF;
  IF v_training.status <> 'archived' THEN
    RAISE EXCEPTION 'Pelatihan harus diarsipkan terlebih dahulu';
  END IF;
  IF v_training.operational_data_purged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Data operasional sudah pernah dibersihkan';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.training_backups
    WHERE id = p_backup_id
      AND training_id = p_training_id
  ) THEN
    RAISE EXCEPTION 'Backup pelatihan yang valid diperlukan sebelum pembersihan';
  END IF;

  SELECT COALESCE(cs.certificate_enabled, FALSE)
  INTO v_certificate_enabled
  FROM public.certificate_settings cs
  WHERE cs.training_id = p_training_id;

  v_certificate_enabled := COALESCE(v_certificate_enabled, FALSE);

  IF v_certificate_enabled THEN
    FOR v_passed IN
      SELECT a.user_id, MAX(a.score)::NUMERIC AS best_score
      FROM public.test_attempts a
      WHERE a.training_id = p_training_id
        AND a.test_type = 'posttest'
        AND EXISTS (
          SELECT 1
          FROM public.test_attempts pre
          WHERE pre.user_id = a.user_id
            AND pre.training_id = p_training_id
            AND pre.test_type = 'pretest'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.materials m
          WHERE m.training_id = p_training_id
            AND m.active
            AND NOT EXISTS (
              SELECT 1
              FROM public.material_progress mp
              WHERE mp.user_id = a.user_id
                AND mp.material_id = m.id
                AND mp.completed_at IS NOT NULL
            )
        )
      GROUP BY a.user_id
      HAVING MAX(a.score) >= v_training.passing_score
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.certificates c
        WHERE c.training_id = p_training_id
          AND c.user_id = v_passed.user_id
      ) THEN
        PERFORM private.issue_lms_certificate(
          v_passed.user_id,
          p_training_id,
          v_passed.best_score
        );
      END IF;
    END LOOP;

    SELECT count(*)
    INTO v_missing_certificates
    FROM (
      SELECT a.user_id
      FROM public.test_attempts a
      WHERE a.training_id = p_training_id
        AND a.test_type = 'posttest'
        AND EXISTS (
          SELECT 1
          FROM public.test_attempts pre
          WHERE pre.user_id = a.user_id
            AND pre.training_id = p_training_id
            AND pre.test_type = 'pretest'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.materials m
          WHERE m.training_id = p_training_id
            AND m.active
            AND NOT EXISTS (
              SELECT 1
              FROM public.material_progress mp
              WHERE mp.user_id = a.user_id
                AND mp.material_id = m.id
                AND mp.completed_at IS NOT NULL
            )
        )
      GROUP BY a.user_id
      HAVING MAX(a.score) >= v_training.passing_score
    ) eligible
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.certificates c
      WHERE c.training_id = p_training_id
        AND c.user_id = eligible.user_id
    );

    IF v_missing_certificates > 0 THEN
      RAISE EXCEPTION 'Pembersihan ditolak: % peserta yang memenuhi seluruh alur belum memiliki sertifikat. Periksa kegagalan penerbitan sertifikat terlebih dahulu.', v_missing_certificates;
    END IF;
  END IF;

  PERFORM private.capture_training_summary(p_training_id);

  WITH deleted AS (
    DELETE FROM public.test_sessions WHERE training_id = p_training_id RETURNING 1
  ) SELECT count(*) INTO v_sessions FROM deleted;

  WITH deleted AS (
    DELETE FROM public.test_attempts WHERE training_id = p_training_id RETURNING 1
  ) SELECT count(*) INTO v_attempts FROM deleted;

  WITH deleted AS (
    DELETE FROM public.material_progress mp
    USING public.materials m
    WHERE mp.material_id = m.id
      AND m.training_id = p_training_id
    RETURNING 1
  ) SELECT count(*) INTO v_progress FROM deleted;

  WITH deleted AS (
    DELETE FROM public.questions WHERE training_id = p_training_id RETURNING 1
  ) SELECT count(*) INTO v_questions FROM deleted;

  WITH deleted AS (
    DELETE FROM public.materials WHERE training_id = p_training_id RETURNING 1
  ) SELECT count(*) INTO v_materials FROM deleted;

  UPDATE public.trainings
  SET operational_data_purged_at = now(), purged_backup_id = p_backup_id
  WHERE id = p_training_id;

  UPDATE public.training_backups SET verified_at=clock_timestamp() WHERE id=p_backup_id;

  RETURN jsonb_build_object(
    'status', 'purged',
    'certificate_guard_enabled', v_certificate_enabled,
    'sessions', v_sessions,
    'attempts', v_attempts,
    'progress', v_progress,
    'questions', v_questions,
    'materials', v_materials
  );
END;
$$;


REVOKE ALL ON FUNCTION public.admin_purge_verified_training(JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_verified_training(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_restore_training_backup(p_backup JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_training_id UUID; t public.trainings%ROWTYPE; snapshot JSONB; key TEXT;
BEGIN
 p_backup := private.unpack_training_backup(p_backup);
 v_training_id := private.validate_training_backup(p_backup);
 PERFORM private.lock_training_backup_tables();
 SELECT * INTO t FROM public.trainings WHERE trainings.id=v_training_id FOR UPDATE;
 IF t.status IS DISTINCT FROM 'archived' OR t.active OR t.operational_data_purged_at IS NULL
 OR t.purged_backup_id IS DISTINCT FROM (p_backup->>'backup_id')::UUID THEN
  RAISE EXCEPTION 'Pemulihan hanya untuk arsip yang dibersihkan menggunakan backup ini';
 END IF;
 IF (to_jsonb(t) - 'structure_version' - 'operational_data_purged_at' - 'purged_backup_id')
 IS DISTINCT FROM ((p_backup->'training') - 'structure_version' - 'operational_data_purged_at' - 'purged_backup_id') THEN
  RAISE EXCEPTION 'Pengaturan pelatihan berubah sejak backup; pemulihan dibatalkan';
 END IF;
 snapshot := private.training_operational_snapshot(v_training_id);
 FOR key IN SELECT jsonb_object_keys(snapshot) LOOP
  IF jsonb_array_length(snapshot->key) <> 0 THEN RAISE EXCEPTION 'Data operasional sudah ada; pemulihan tidak menimpa data'; END IF;
 END LOOP;
 -- No disabled triggers or ON CONFLICT: missing users, duplicate IDs or incompatible
 -- schemas roll back the whole operation. Content first, participant activity last.
 INSERT INTO public.materials SELECT * FROM jsonb_populate_recordset(NULL::public.materials,p_backup->'materials');
 INSERT INTO public.questions SELECT * FROM jsonb_populate_recordset(NULL::public.questions,p_backup->'questions');
 INSERT INTO public.test_sessions SELECT * FROM jsonb_populate_recordset(NULL::public.test_sessions,p_backup->'test_sessions');
 INSERT INTO public.test_attempts SELECT * FROM jsonb_populate_recordset(NULL::public.test_attempts,p_backup->'test_attempts');
 INSERT INTO public.material_progress SELECT * FROM jsonb_populate_recordset(NULL::public.material_progress,p_backup->'material_progress');
 snapshot := private.training_operational_snapshot(v_training_id);
 FOR key IN SELECT jsonb_object_keys(snapshot) LOOP
  IF snapshot->key IS DISTINCT FROM p_backup->key THEN RAISE EXCEPTION 'Hasil pemulihan tidak cocok dengan backup'; END IF;
 END LOOP;
 UPDATE public.trainings SET operational_data_purged_at=NULL,purged_backup_id=NULL WHERE trainings.id=v_training_id;
 UPDATE public.training_backups SET restored_at=clock_timestamp() WHERE training_backups.id=(p_backup->>'backup_id')::UUID;
 RETURN jsonb_build_object('status','restored','training_id',v_training_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_restore_training_backup(JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_training_backup(JSONB) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
