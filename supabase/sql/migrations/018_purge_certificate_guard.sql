-- Pengamanan final sebelum data operasional pelatihan arsip dibersihkan.
-- Migrasi ini BELUM pernah diterapkan ke produksi saat disusun.
--
-- Aturan:
-- 1. Pelatihan harus berstatus archived dan sudah memiliki backup valid.
-- 2. Peserta belum selesai materi, belum Post-Test, atau belum lulus tidak menghalangi purge.
-- 3. Bila sertifikat untuk pelatihan dinonaktifkan, peserta lulus tanpa sertifikat tidak menghalangi purge.
-- 4. Bila sertifikat aktif, sistem mencoba memulihkan sertifikat peserta yang sudah lulus terlebih dahulu.
-- 5. Purge ditolak hanya jika setelah pemulihan masih ada peserta lulus tanpa sertifikat.

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

  SELECT COALESCE(cs.certificate_enabled, FALSE)
  INTO v_certificate_enabled
  FROM public.certificate_settings cs
  WHERE cs.training_id = p_training_id;

  v_certificate_enabled := COALESCE(v_certificate_enabled, FALSE);

  IF v_certificate_enabled THEN
    -- Pulihkan terlebih dahulu sertifikat peserta yang sudah mencapai passing score.
    -- Fungsi issuer bersifat idempotent sehingga aman bila sertifikat sudah ada.
    FOR v_passed IN
      SELECT a.user_id, MAX(a.score)::NUMERIC AS best_score
      FROM public.test_attempts a
      WHERE a.training_id = p_training_id
        AND a.test_type = 'posttest'
      GROUP BY a.user_id
      HAVING MAX(a.score) >= v_training.passing_score
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.certificates c
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
      RAISE EXCEPTION 'Pembersihan ditolak: % peserta sudah lulus tetapi sertifikat belum berhasil diterbitkan. Periksa kegagalan penerbitan sertifikat terlebih dahulu.', v_missing_certificates;
    END IF;
  END IF;

  -- Simpan statistik final sebelum data operasional dihapus.
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
    'certificate_guard_enabled', v_certificate_enabled,
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
