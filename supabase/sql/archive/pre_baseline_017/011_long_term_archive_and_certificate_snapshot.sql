-- Arsip jangka panjang dan snapshot sertifikat permanen.
-- Jalankan setelah migrasi 010. Aman dijalankan ulang.

BEGIN;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE public.trainings
SET status = CASE WHEN active THEN 'active' ELSE 'archived' END
WHERE status IS NULL OR status NOT IN ('draft', 'active', 'archived');

ALTER TABLE public.trainings
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.trainings
  DROP CONSTRAINT IF EXISTS trainings_status_check;
ALTER TABLE public.trainings
  ADD CONSTRAINT trainings_status_check CHECK (status IN ('draft', 'active', 'archived'));

-- Kolom active dipertahankan agar versi aplikasi lama tetap kompatibel.
CREATE OR REPLACE FUNCTION private.sync_training_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := COALESCE(NEW.status, CASE WHEN NEW.active THEN 'active' ELSE 'draft' END);
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.active IS DISTINCT FROM OLD.active THEN
    NEW.status := CASE WHEN NEW.active THEN 'active' ELSE 'archived' END;
  END IF;
  NEW.active := NEW.status = 'active';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trainings_sync_status ON public.trainings;
CREATE TRIGGER trainings_sync_status
BEFORE INSERT OR UPDATE OF status, active ON public.trainings
FOR EACH ROW EXECUTE FUNCTION private.sync_training_status();
REVOKE ALL ON FUNCTION private.sync_training_status() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS user_name TEXT,
  ADD COLUMN IF NOT EXISTS user_institution TEXT,
  ADD COLUMN IF NOT EXISTS training_title TEXT,
  ADD COLUMN IF NOT EXISTS training_jpl INTEGER,
  ADD COLUMN IF NOT EXISTS training_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS training_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS show_posttest_score BOOLEAN,
  ADD COLUMN IF NOT EXISTS signatory_name TEXT,
  ADD COLUMN IF NOT EXISTS signatory_title TEXT,
  ADD COLUMN IF NOT EXISTS signatory_image_url TEXT,
  ADD COLUMN IF NOT EXISTS stamp_image_url TEXT;

-- Bekukan data sertifikat lama sebelum hubungan induknya diubah.
UPDATE public.certificates c
SET user_name = COALESCE(c.user_name,
      (SELECT NULLIF(p.full_name, '') FROM public.profiles p WHERE p.id = c.user_id),
      (SELECT NULLIF(u.raw_user_meta_data ->> 'full_name', '') FROM auth.users u WHERE u.id = c.user_id),
      (SELECT NULLIF(split_part(COALESCE(u.email, ''), '@', 1), '') FROM auth.users u WHERE u.id = c.user_id),
      'Peserta'),
    user_institution = COALESCE(c.user_institution,
      (SELECT NULLIF(p.institution, '') FROM public.profiles p WHERE p.id = c.user_id),
      (SELECT NULLIF(u.raw_user_meta_data ->> 'institution', '') FROM auth.users u WHERE u.id = c.user_id),
      'Belum diisi'),
    training_title = COALESCE(c.training_title, t.title, 'Pelatihan LMS'),
    training_jpl = COALESCE(c.training_jpl, t.jpl, 1),
    training_start_date = COALESCE(c.training_start_date, t.start_date),
    training_end_date = COALESCE(c.training_end_date, t.end_date),
    show_posttest_score = COALESCE(c.show_posttest_score, cs.show_posttest_score, TRUE),
    signatory_name = COALESCE(c.signatory_name, cs.signatory_name, 'Nama Direktur'),
    signatory_title = COALESCE(c.signatory_title, cs.signatory_title, 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang'),
    signatory_image_url = COALESCE(c.signatory_image_url, cs.signatory_image_url),
    stamp_image_url = COALESCE(c.stamp_image_url, cs.stamp_image_url)
FROM public.trainings t
LEFT JOIN public.certificate_settings cs ON cs.training_id = t.id
WHERE c.training_id = t.id;

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
BEGIN
  IF NEW.training_id IS NOT NULL THEN
    SELECT * INTO v_training FROM public.trainings WHERE id = NEW.training_id;
    SELECT * INTO v_settings FROM public.certificate_settings WHERE training_id = NEW.training_id;
  END IF;
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
  NEW.signatory_name := COALESCE(NEW.signatory_name, v_settings.signatory_name, 'Nama Direktur');
  NEW.signatory_title := COALESCE(NEW.signatory_title, v_settings.signatory_title, 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang');
  NEW.signatory_image_url := COALESCE(NEW.signatory_image_url, v_settings.signatory_image_url);
  NEW.stamp_image_url := COALESCE(NEW.stamp_image_url, v_settings.stamp_image_url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificates_snapshot_before_write ON public.certificates;
CREATE TRIGGER certificates_snapshot_before_write
BEFORE INSERT OR UPDATE ON public.certificates
FOR EACH ROW EXECUTE FUNCTION private.snapshot_lms_certificate();
REVOKE ALL ON FUNCTION private.snapshot_lms_certificate() FROM PUBLIC, anon, authenticated;

-- Penghapusan akun/pelatihan tidak lagi menghapus dokumen sertifikat.
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_user_id_fkey;
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_training_id_fkey;
ALTER TABLE public.certificates
  ADD CONSTRAINT certificates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT certificates_training_id_fkey FOREIGN KEY (training_id) REFERENCES public.trainings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trainings_status_created_idx
  ON public.trainings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS certificates_user_issued_idx
  ON public.certificates (user_id, issued_at DESC);

DROP POLICY IF EXISTS trainings_select_authenticated ON public.trainings;
CREATE POLICY trainings_select_authenticated ON public.trainings
FOR SELECT TO authenticated
USING (
  status = 'active'
  OR private.is_lms_admin()
);

DROP POLICY IF EXISTS materials_select_authenticated ON public.materials;
CREATE POLICY materials_select_authenticated ON public.materials
FOR SELECT TO authenticated
USING (
  private.is_lms_admin()
  OR (active AND EXISTS (
    SELECT 1 FROM public.trainings t
    WHERE t.id = training_id AND t.status = 'active'
  ))
);

CREATE OR REPLACE FUNCTION public.verify_certificate(p_code TEXT)
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
  training_end_date TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.certificate_number, c.verification_code, c.issued_at, c.posttest_score,
         COALESCE(c.user_name, 'Peserta'), COALESCE(c.user_institution, 'Belum diisi'),
         COALESCE(c.training_title, 'Pelatihan LMS'), COALESCE(c.training_jpl, 1),
         c.training_start_date, c.training_end_date
  FROM public.certificates c
  WHERE c.verification_code = upper(trim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
