-- Integritas kelayakan sertifikat dan purge arsip.
-- Jalankan setelah 018_purge_certificate_guard.sql.
-- Aman dijalankan ulang.

BEGIN;

-- Satu sumber kebenaran untuk menentukan apakah peserta benar-benar layak
-- menerima sertifikat. Nilai tidak pernah dipercaya dari parameter client.
CREATE OR REPLACE FUNCTION private.lms_certificate_eligible_score(
  p_user_id UUID,
  p_training_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_passing_score NUMERIC;
  v_best_score NUMERIC;
BEGIN
  IF p_user_id IS NULL OR p_training_id IS NULL THEN
    RAISE EXCEPTION 'Peserta dan pelatihan wajib tersedia';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id AND p.role = 'peserta'
  ) THEN
    RAISE EXCEPTION 'Profil peserta tidak ditemukan';
  END IF;

  SELECT t.passing_score
  INTO v_passing_score
  FROM public.trainings t
  WHERE t.id = p_training_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelatihan tidak ditemukan';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.test_attempts a
    WHERE a.user_id = p_user_id
      AND a.training_id = p_training_id
      AND a.test_type = 'pretest'
  ) THEN
    RAISE EXCEPTION 'Peserta belum menyelesaikan Pre-Test';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.materials m
    WHERE m.training_id = p_training_id
      AND m.active
      AND NOT EXISTS (
        SELECT 1
        FROM public.material_progress mp
        WHERE mp.user_id = p_user_id
          AND mp.material_id = m.id
          AND mp.completed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Peserta belum menyelesaikan seluruh materi';
  END IF;

  SELECT MAX(a.score)
  INTO v_best_score
  FROM public.test_attempts a
  WHERE a.user_id = p_user_id
    AND a.training_id = p_training_id
    AND a.test_type = 'posttest';

  IF v_best_score IS NULL THEN
    RAISE EXCEPTION 'Peserta belum menyelesaikan Post-Test';
  END IF;

  IF v_best_score < v_passing_score THEN
    RAISE EXCEPTION 'Peserta belum lulus Post-Test';
  END IF;

  RETURN v_best_score;
END;
$$;

REVOKE ALL ON FUNCTION private.lms_certificate_eligible_score(UUID, UUID)
FROM PUBLIC, anon, authenticated;

-- Penerbit sertifikat tetap memakai signature lama agar seluruh RPC yang sudah
-- ada tetap kompatibel, tetapi skor parameter tidak lagi dipercaya.
CREATE OR REPLACE FUNCTION private.issue_lms_certificate(
  p_user_id UUID,
  p_training_id UUID,
  p_score NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.certificate_settings%ROWTYPE;
  v_score NUMERIC;
  v_number TEXT := NULL;
  v_next INTEGER;
  v_month TEXT;
  v_roman TEXT;
  v_code TEXT;
  v_inserted_id UUID;
  v_issue_time TIMESTAMPTZ := clock_timestamp();
  v_wita_time TIMESTAMP;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::TEXT || ':' || p_training_id::TEXT || ':certificate', 0)
  );

  -- Sertifikat yang sudah pernah diterbitkan tidak dibuat ulang.
  IF EXISTS (
    SELECT 1
    FROM public.certificates c
    WHERE c.user_id = p_user_id
      AND c.training_id = p_training_id
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT *
  INTO v_settings
  FROM public.certificate_settings
  WHERE training_id = p_training_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_settings.certificate_enabled THEN
    RETURN FALSE;
  END IF;

  -- Validasi alur lengkap di server dan ambil skor langsung dari database.
  v_score := private.lms_certificate_eligible_score(p_user_id, p_training_id);

  v_wita_time := v_issue_time AT TIME ZONE 'Asia/Makassar';

  IF v_settings.numbering_enabled THEN
    v_next := COALESCE(v_settings.current_number, v_settings.start_number, 1);
    v_month := to_char(v_wita_time, 'MM');
    v_roman := (ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[v_month::INTEGER];
    v_number := COALESCE(v_settings.number_format, '{NO}/SERT/{TAHUN}');
    v_number := replace(v_number, '{NO}', lpad(v_next::TEXT, COALESCE(v_settings.number_digits, 4), '0'));
    v_number := replace(v_number, '{TAHUN}', to_char(v_wita_time, 'YYYY'));
    v_number := replace(v_number, '{TAHUN2}', to_char(v_wita_time, 'YY'));
    v_number := replace(v_number, '{BULAN}', v_month);
    v_number := replace(v_number, '{BULAN_ROMAWI}', v_roman);
  END IF;

  LOOP
    v_code := upper(substr(md5(gen_random_uuid()::TEXT || clock_timestamp()::TEXT), 1, 10));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.certificates c WHERE c.verification_code = v_code
    );
  END LOOP;

  INSERT INTO public.certificates (
    user_id,
    training_id,
    certificate_number,
    verification_code,
    issued_at,
    posttest_score
  ) VALUES (
    p_user_id,
    p_training_id,
    v_number,
    v_code,
    v_issue_time,
    v_score
  )
  ON CONFLICT (user_id, training_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.certificates c
      WHERE c.user_id = p_user_id
        AND c.training_id = p_training_id
    ) THEN
      RETURN TRUE;
    END IF;

    INSERT INTO public.certificate_issuance_failures(
      user_id, training_id, error_code, error_message
    ) VALUES (
      p_user_id, p_training_id, 'INSERT_NO_ROW', 'INSERT sertifikat tidak menghasilkan baris.'
    );
    RETURN FALSE;
  END IF;

  IF v_settings.numbering_enabled THEN
    UPDATE public.certificate_settings
    SET current_number = v_next + 1,
        updated_at = v_issue_time
    WHERE id = v_settings.id;
  END IF;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.certificate_issuance_failures(
    user_id, training_id, error_code, error_message
  ) VALUES (
    p_user_id, p_training_id, SQLSTATE, SQLERRM
  );
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION private.issue_lms_certificate(UUID, UUID, NUMERIC)
FROM PUBLIC, anon, authenticated;

-- Pemulihan sertifikat peserta wajib melewati validator alur lengkap.
CREATE OR REPLACE FUNCTION public.ensure_my_certificate(p_training_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_score NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'peserta'
  ) THEN
    RAISE EXCEPTION 'Akses hanya untuk peserta';
  END IF;

  -- Memunculkan alasan yang jelas ke peserta bila alurnya belum valid.
  v_score := private.lms_certificate_eligible_score(auth.uid(), p_training_id);

  RETURN private.issue_lms_certificate(auth.uid(), p_training_id, v_score);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_certificate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_certificate(UUID) TO authenticated;

-- Pemulihan massal milik peserta juga hanya menghitung pelatihan dengan alur
-- lengkap, sehingga attempt lama yang tidak valid tidak dapat menerbitkan sertifikat.
CREATE OR REPLACE FUNCTION public.ensure_my_missing_certificates()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
  v_issued INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'peserta'
  ) THEN
    RAISE EXCEPTION 'Akses hanya untuk peserta';
  END IF;

  FOR v_row IN
    SELECT a.training_id, MAX(a.score)::NUMERIC AS best_score
    FROM public.test_attempts a
    JOIN public.trainings t ON t.id = a.training_id
    WHERE a.user_id = auth.uid()
      AND a.test_type = 'posttest'
      AND EXISTS (
        SELECT 1 FROM public.test_attempts pre
        WHERE pre.user_id = auth.uid()
          AND pre.training_id = a.training_id
          AND pre.test_type = 'pretest'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.materials m
        WHERE m.training_id = a.training_id
          AND m.active
          AND NOT EXISTS (
            SELECT 1
            FROM public.material_progress mp
            WHERE mp.user_id = auth.uid()
              AND mp.material_id = m.id
              AND mp.completed_at IS NOT NULL
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.certificates c
        WHERE c.user_id = auth.uid()
          AND c.training_id = a.training_id
      )
    GROUP BY a.training_id, t.passing_score
    HAVING MAX(a.score) >= t.passing_score
  LOOP
    IF private.issue_lms_certificate(auth.uid(), v_row.training_id, v_row.best_score) THEN
      v_issued := v_issued + 1;
    END IF;
  END LOOP;

  RETURN v_issued;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_missing_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_missing_certificates() TO authenticated;

-- Ganti purge 018 agar hanya peserta yang benar-benar memenuhi alur lengkap
-- yang diwajibkan memiliki sertifikat sebelum data operasional dibersihkan.
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
