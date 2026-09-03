-- Penguatan integritas penerbitan, arsip, snapshot, dan zona waktu sertifikat.
-- Jalankan setelah migrasi 015. Aman dijalankan ulang.

BEGIN;

CREATE TABLE IF NOT EXISTS public.certificate_issuance_failures (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  training_id UUID,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certificate_issuance_failures_occurred_idx
  ON public.certificate_issuance_failures (occurred_at DESC);
CREATE INDEX IF NOT EXISTS certificate_issuance_failures_training_idx
  ON public.certificate_issuance_failures (training_id, occurred_at DESC);

ALTER TABLE public.certificate_issuance_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS certificate_issuance_failures_admin_select ON public.certificate_issuance_failures;
CREATE POLICY certificate_issuance_failures_admin_select
ON public.certificate_issuance_failures FOR SELECT TO authenticated
USING (private.is_lms_admin());

REVOKE ALL ON TABLE public.certificate_issuance_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.certificate_issuance_failures TO authenticated;

-- Penerbitan idempoten. Nomor berjalan hanya maju bila INSERT sertifikat benar-benar berhasil.
-- Semua placeholder tanggal memakai WITA (Asia/Makassar), sama dengan tampilan aplikasi.
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
  v_number TEXT := NULL;
  v_next INTEGER;
  v_month TEXT;
  v_roman TEXT;
  v_code TEXT;
  v_inserted_id UUID;
  v_issue_time TIMESTAMPTZ := clock_timestamp();
  v_wita_time TIMESTAMP;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || p_training_id::TEXT || ':certificate', 0));

  IF EXISTS (
    SELECT 1 FROM public.certificates c
    WHERE c.user_id = p_user_id AND c.training_id = p_training_id
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_settings
  FROM public.certificate_settings
  WHERE training_id = p_training_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_settings.certificate_enabled THEN
    RETURN FALSE;
  END IF;

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
    user_id, training_id, certificate_number, verification_code, issued_at, posttest_score
  ) VALUES (
    p_user_id, p_training_id, v_number, v_code, v_issue_time, p_score
  )
  ON CONFLICT (user_id, training_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.certificates c
      WHERE c.user_id = p_user_id AND c.training_id = p_training_id
    ) THEN
      RETURN TRUE;
    END IF;

    INSERT INTO public.certificate_issuance_failures(user_id, training_id, error_code, error_message)
    VALUES (p_user_id, p_training_id, 'INSERT_NO_ROW', 'INSERT sertifikat tidak menghasilkan baris.');
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
  INSERT INTO public.certificate_issuance_failures(user_id, training_id, error_code, error_message)
  VALUES (p_user_id, p_training_id, SQLSTATE, SQLERRM);
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION private.issue_lms_certificate(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- Recovery satu pelatihan tetap berlaku walaupun pelatihan sudah diarsipkan.
CREATE OR REPLACE FUNCTION public.ensure_my_certificate(p_training_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_score NUMERIC;
  v_passing_score INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'peserta'
  ) THEN RAISE EXCEPTION 'Akses hanya untuk peserta'; END IF;

  SELECT t.passing_score INTO v_passing_score
  FROM public.trainings t
  WHERE t.id = p_training_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak ditemukan'; END IF;

  SELECT MAX(a.score) INTO v_score
  FROM public.test_attempts a
  WHERE a.user_id = auth.uid()
    AND a.training_id = p_training_id
    AND a.test_type = 'posttest';

  IF v_score IS NULL OR v_score < v_passing_score THEN
    RAISE EXCEPTION 'Peserta belum lulus Post-Test';
  END IF;

  RETURN private.issue_lms_certificate(auth.uid(), p_training_id, v_score);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_certificate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_certificate(UUID) TO authenticated;

-- Recovery massal tidak bergantung pada daftar pelatihan aktif di browser.
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'peserta'
  ) THEN RAISE EXCEPTION 'Akses hanya untuk peserta'; END IF;

  FOR v_row IN
    SELECT a.training_id, MAX(a.score) AS best_score
    FROM public.test_attempts a
    JOIN public.trainings t ON t.id = a.training_id
    WHERE a.user_id = auth.uid()
      AND a.test_type = 'posttest'
      AND NOT EXISTS (
        SELECT 1 FROM public.certificates c
        WHERE c.user_id = auth.uid() AND c.training_id = a.training_id
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

-- Snapshot dokumen sertifikat tidak boleh berubah setelah penerbitan.
CREATE OR REPLACE FUNCTION private.snapshot_lms_certificate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_training public.trainings%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_auth auth.users%ROWTYPE;
  v_settings public.certificate_settings%ROWTYPE;
  v_global public.certificate_global_settings%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.user_id := OLD.user_id;
    NEW.training_id := OLD.training_id;
    NEW.certificate_number := OLD.certificate_number;
    NEW.verification_code := OLD.verification_code;
    NEW.issued_at := OLD.issued_at;
    NEW.posttest_score := OLD.posttest_score;
    NEW.user_name := OLD.user_name;
    NEW.user_institution := OLD.user_institution;
    NEW.training_title := OLD.training_title;
    NEW.training_jpl := OLD.training_jpl;
    NEW.training_start_date := OLD.training_start_date;
    NEW.training_end_date := OLD.training_end_date;
    NEW.show_posttest_score := OLD.show_posttest_score;
    NEW.signatory_name := OLD.signatory_name;
    NEW.signatory_title := OLD.signatory_title;
    NEW.signatory_image_url := OLD.signatory_image_url;
    NEW.stamp_image_url := OLD.stamp_image_url;
    RETURN NEW;
  END IF;

  IF NEW.training_id IS NOT NULL THEN
    SELECT * INTO v_training FROM public.trainings WHERE id = NEW.training_id;
    SELECT * INTO v_settings FROM public.certificate_settings WHERE training_id = NEW.training_id;
  END IF;
  SELECT * INTO v_global FROM public.certificate_global_settings WHERE singleton = TRUE;
  IF NEW.user_id IS NOT NULL THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = NEW.user_id;
    SELECT * INTO v_auth FROM auth.users WHERE id = NEW.user_id;
  END IF;

  NEW.user_name := COALESCE(NEW.user_name, NULLIF(v_profile.full_name, ''), NULLIF(v_auth.raw_user_meta_data ->> 'full_name', ''), NULLIF(split_part(COALESCE(v_auth.email, ''), '@', 1), ''), 'Peserta');
  NEW.user_institution := COALESCE(NEW.user_institution, NULLIF(v_profile.institution, ''), NULLIF(v_auth.raw_user_meta_data ->> 'institution', ''), 'Belum diisi');
  NEW.training_title := COALESCE(NEW.training_title, v_training.title, 'Pelatihan LMS');
  NEW.training_jpl := COALESCE(NEW.training_jpl, v_training.jpl, 1);
  NEW.training_start_date := COALESCE(NEW.training_start_date, v_training.start_date);
  NEW.training_end_date := COALESCE(NEW.training_end_date, v_training.end_date);
  NEW.show_posttest_score := COALESCE(NEW.show_posttest_score, v_settings.show_posttest_score, TRUE);
  NEW.signatory_name := COALESCE(NEW.signatory_name, v_global.signatory_name, v_settings.signatory_name, 'Nama Direktur');
  NEW.signatory_title := COALESCE(NEW.signatory_title, v_global.signatory_title, v_settings.signatory_title, 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang');
  NEW.signatory_image_url := COALESCE(NEW.signatory_image_url, v_global.signatory_image_url, v_settings.signatory_image_url);
  NEW.stamp_image_url := COALESCE(NEW.stamp_image_url, v_global.stamp_image_url, v_settings.stamp_image_url);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_lms_certificate() FROM PUBLIC, anon, authenticated;

-- Verifikasi publik memakai snapshot permanen dan menghormati pengaturan tampil nilai.
DROP FUNCTION IF EXISTS public.verify_certificate(TEXT);
CREATE FUNCTION public.verify_certificate(p_code TEXT)
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
  training_end_date TIMESTAMPTZ,
  show_posttest_score BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.certificate_number,
         c.verification_code,
         c.issued_at,
         CASE WHEN COALESCE(c.show_posttest_score, TRUE) THEN c.posttest_score ELSE NULL END,
         COALESCE(c.user_name, 'Peserta'),
         COALESCE(c.user_institution, 'Belum diisi'),
         COALESCE(c.training_title, 'Pelatihan LMS'),
         COALESCE(c.training_jpl, 1),
         c.training_start_date,
         c.training_end_date,
         COALESCE(c.show_posttest_score, TRUE)
  FROM public.certificates c
  WHERE c.verification_code = upper(trim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
