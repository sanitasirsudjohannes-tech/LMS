-- Pengaturan Direktur global dengan snapshot permanen pada sertifikat.
-- Jalankan setelah migrasi 012. Aman dijalankan ulang.

BEGIN;

CREATE TABLE IF NOT EXISTS public.certificate_global_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  signatory_name TEXT NOT NULL DEFAULT 'Nama Direktur',
  signatory_title TEXT NOT NULL DEFAULT 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
  signatory_image_url TEXT,
  stamp_image_url TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Gunakan pengaturan pelatihan yang terakhir diperbarui sebagai nilai awal.
INSERT INTO public.certificate_global_settings (
  singleton, signatory_name, signatory_title,
  signatory_image_url, stamp_image_url, version
)
SELECT TRUE,
       COALESCE(cs.signatory_name, 'Nama Direktur'),
       COALESCE(cs.signatory_title, 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang'),
       cs.signatory_image_url,
       cs.stamp_image_url,
       1
FROM public.certificate_settings cs
ORDER BY cs.updated_at DESC NULLS LAST
LIMIT 1
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO public.certificate_global_settings (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.certificate_global_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS certificate_global_settings_select_authenticated ON public.certificate_global_settings;
CREATE POLICY certificate_global_settings_select_authenticated
ON public.certificate_global_settings FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS certificate_global_settings_update_admin ON public.certificate_global_settings;
CREATE POLICY certificate_global_settings_update_admin
ON public.certificate_global_settings FOR UPDATE TO authenticated
USING (private.is_lms_admin()) WITH CHECK (private.is_lms_admin());

REVOKE ALL ON TABLE public.certificate_global_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.certificate_global_settings TO authenticated;

CREATE OR REPLACE FUNCTION private.version_certificate_global_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.singleton := TRUE;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificate_global_settings_version_before_update
ON public.certificate_global_settings;
CREATE TRIGGER certificate_global_settings_version_before_update
BEFORE UPDATE ON public.certificate_global_settings
FOR EACH ROW EXECUTE FUNCTION private.version_certificate_global_settings();
REVOKE ALL ON FUNCTION private.version_certificate_global_settings() FROM PUBLIC, anon, authenticated;

-- Sertifikat baru mengambil Direktur global. COALESCE pada NEW membuat data
-- sertifikat lama tetap beku ketika barisnya diperbarui untuk keperluan lain.
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

NOTIFY pgrst, 'reload schema';
COMMIT;
