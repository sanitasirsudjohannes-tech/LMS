-- Lindungi hak sertifikat sebelum data operasional pelatihan arsip dibersihkan.
-- Peserta yang belum menyelesaikan materi, belum Post-Test, atau belum lulus
-- TIDAK menghalangi purge. Purge hanya ditolak bila ada peserta yang sudah
-- mencapai passing score pada Post-Test tetapi belum memiliki sertifikat.

BEGIN;

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
  v_missing_certificates BIGINT;
BEGIN
  IF NOT private.is_lms_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Akses admin diperlukan';
  END IF;

  SELECT * INTO v_training
  FROM public.trainings
  WHERE id = p_training_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelatihan tidak ditemukan';
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
    WHERE id = p_backup_id AND training_id = p_training_id
  ) THEN
    RAISE EXCEPTION 'Backup pelatihan yang valid diperlukan sebelum pembersihan';
  END IF;

  -- Hanya peserta yang SUDAH LULUS yang wajib mempunyai sertifikat sebelum
  -- test_attempts dihapus. Peserta belum selesai / belum Post-Test / belum lulus
  -- tetap boleh ikut dibersihkan setelah pelatihan diarsipkan dan dibackup.
  SELECT count(*) INTO v_missing_certificates
  FROM (
    SELECT a.user_id
    FROM public.test_attempts a
    WHERE a.training_id = p_training_id
      AND a.test_type = 'posttest'
    GROUP BY a.user_id
    HAVING MAX(a.score) >= v_training.passing_score
  ) passed
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.certificates c
    WHERE c.training_id = p_training_id
      AND c.user_id = passed.user_id
  );

  IF v_missing_certificates > 0 THEN
    RAISE EXCEPTION 'Pembersihan ditolak: % peserta sudah lulus tetapi sertifikat belum terbit. Pulihkan sertifikat terlebih dahulu.', v_missing_certificates;
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
    WHERE mp.material_id = m.id AND m.training_id = p_training_id
    RETURNING 1
  ) SELECT count(*) INTO v_progress FROM deleted;

  WITH deleted AS (
    DELETE FROM public.questions WHERE training_id = p_training_id RETURNING 1
  ) SELECT count(*) INTO v_questions FROM deleted;

  WITH deleted AS (
    DELETE FROM public.materials WHERE training_id = p_training_id RETURNING 1
  ) SELECT count(*) INTO v_materials FROM deleted;

  UPDATE public.trainings
  SET operational_data_purged_at = now()
  WHERE id = p_training_id;

  RETURN jsonb_build_object(
    'status', 'purged',
    'sessions', v_sessions,
    'attempts', v_attempts,
    'progress', v_progress,
    'questions', v_questions,
    'materials', v_materials
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_archived_training(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_archived_training(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
