-- ============================================================
-- MIGRASI JPL DAN BATAS POST-TEST
-- Jalankan satu kali setelah security_hardening.sql.
-- ============================================================

BEGIN;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS jpl INTEGER;

UPDATE public.trainings
SET jpl = 1
WHERE jpl IS NULL OR jpl < 1;

ALTER TABLE public.trainings
  ALTER COLUMN jpl SET DEFAULT 1,
  ALTER COLUMN jpl SET NOT NULL;

ALTER TABLE public.trainings
  DROP CONSTRAINT IF EXISTS trainings_jpl_check;
ALTER TABLE public.trainings
  ADD CONSTRAINT trainings_jpl_check CHECK (jpl > 0);

-- Seluruh pelatihan, lama maupun baru, dibatasi tepat 5 kesempatan.
UPDATE public.trainings SET max_posttest_attempts = 5;
ALTER TABLE public.trainings
  ALTER COLUMN max_posttest_attempts SET DEFAULT 5,
  ALTER COLUMN max_posttest_attempts SET NOT NULL;

ALTER TABLE public.trainings
  DROP CONSTRAINT IF EXISTS trainings_max_posttest_attempts_check;
ALTER TABLE public.trainings
  ADD CONSTRAINT trainings_max_posttest_attempts_check
  CHECK (max_posttest_attempts = 5);

-- Tambahkan JPL pada hasil verifikasi sertifikat publik.
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
  training_jpl INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.certificate_number, c.verification_code, c.issued_at, c.posttest_score,
         p.full_name, p.institution, t.title, t.jpl
  FROM public.certificates c
  JOIN public.profiles p ON p.id = c.user_id
  JOIN public.trainings t ON t.id = c.training_id
  WHERE c.verification_code = upper(trim(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;

COMMIT;
