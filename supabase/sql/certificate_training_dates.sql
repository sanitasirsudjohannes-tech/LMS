-- ============================================================
-- MIGRASI TANGGAL PELATIHAN PADA SERTIFIKAT
-- Jalankan satu kali setelah training_jpl_and_attempt_limit.sql.
-- ============================================================

BEGIN;

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
  training_end_date TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.certificate_number, c.verification_code, c.issued_at, c.posttest_score,
         p.full_name, p.institution, t.title, t.jpl, t.start_date, t.end_date
  FROM public.certificates c
  JOIN public.profiles p ON p.id = c.user_id
  JOIN public.trainings t ON t.id = c.training_id
  WHERE c.verification_code = upper(trim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;

COMMIT;
