-- Schema SQL for LMS Pelatihan Online (PRD mengacu ke Section 21)

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  institution TEXT NOT NULL,
  nip_nik TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'peserta',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Trainings Table
CREATE TABLE IF NOT EXISTS public.trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  passing_score INT DEFAULT 80,
  max_posttest_attempts INT NOT NULL DEFAULT 5 CHECK (max_posttest_attempts = 5),
  jpl INT NOT NULL DEFAULT 1 CHECK (jpl > 0),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Materials Table
CREATE TABLE IF NOT EXISTS public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID REFERENCES public.trainings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  content_url TEXT,
  minimum_duration_seconds INT DEFAULT 0,
  order_number INT NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

-- 4. Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID REFERENCES public.trainings(id) ON DELETE CASCADE,
  test_type TEXT NOT NULL CHECK (test_type IN ('pretest', 'posttest')),
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer TEXT NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  active BOOLEAN DEFAULT TRUE
);

-- 5. Test Attempts Table
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  training_id UUID REFERENCES public.trainings(id) ON DELETE CASCADE,
  test_type TEXT NOT NULL CHECK (test_type IN ('pretest', 'posttest')),
  score NUMERIC NOT NULL,
  attempt_number INT DEFAULT 1,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Material Progress Table
CREATE TABLE IF NOT EXISTS public.material_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 7. Certificate Settings Table
CREATE TABLE IF NOT EXISTS public.certificate_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID REFERENCES public.trainings(id) ON DELETE CASCADE UNIQUE,
  certificate_enabled BOOLEAN DEFAULT TRUE,
  numbering_enabled BOOLEAN DEFAULT TRUE,
  number_format TEXT DEFAULT '{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}',
  start_number INT DEFAULT 1,
  number_digits INT DEFAULT 4,
  current_number INT DEFAULT 1,
  show_posttest_score BOOLEAN DEFAULT TRUE,
  signatory_name TEXT DEFAULT 'Nama Direktur',
  signatory_title TEXT DEFAULT 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Certificates Table
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  training_id UUID REFERENCES public.trainings(id) ON DELETE CASCADE,
  certificate_number TEXT,
  verification_code TEXT UNIQUE NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  posttest_score NUMERIC
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Permissive RLS Policies for standard application usage
-- trainings: publicly readable and admin-writable
CREATE POLICY "Allow public read trainings" ON public.trainings FOR SELECT USING (true);
CREATE POLICY "Allow insert trainings" ON public.trainings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update trainings" ON public.trainings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete trainings" ON public.trainings FOR DELETE USING (true);

CREATE POLICY "Allow public read materials" ON public.materials FOR SELECT USING (true);
CREATE POLICY "Allow insert materials" ON public.materials FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update materials" ON public.materials FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete materials" ON public.materials FOR DELETE USING (true);

CREATE POLICY "Allow public read questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Allow insert questions" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update questions" ON public.questions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete questions" ON public.questions FOR DELETE USING (true);

CREATE POLICY "Allow public read certificate_settings" ON public.certificate_settings FOR SELECT USING (true);
CREATE POLICY "Allow insert certificate_settings" ON public.certificate_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update certificate_settings" ON public.certificate_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete certificate_settings" ON public.certificate_settings FOR DELETE USING (true);

-- profiles: anyone (anon + authenticated) dapat insert saat signup
CREATE POLICY "Allow read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update profiles" ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete profiles" ON public.profiles FOR DELETE USING (true);

CREATE POLICY "Allow read test_attempts" ON public.test_attempts FOR SELECT USING (true);
CREATE POLICY "Allow insert test_attempts" ON public.test_attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update test_attempts" ON public.test_attempts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete test_attempts" ON public.test_attempts FOR DELETE USING (true);

CREATE POLICY "Allow read material_progress" ON public.material_progress FOR SELECT USING (true);
CREATE POLICY "Allow insert material_progress" ON public.material_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update material_progress" ON public.material_progress FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete material_progress" ON public.material_progress FOR DELETE USING (true);

CREATE POLICY "Allow read certificates" ON public.certificates FOR SELECT USING (true);
CREATE POLICY "Allow insert certificates" ON public.certificates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update certificates" ON public.certificates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete certificates" ON public.certificates FOR DELETE USING (true);

-- Atomic Certificate Issuance Function
CREATE OR REPLACE FUNCTION issue_certificate(
  p_user_id UUID,
  p_training_id UUID,
  p_score NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_settings RECORD;
  v_cert_num TEXT := NULL;
  v_next_num INT;
  v_roman_month TEXT;
  v_month TEXT;
  v_year TEXT;
  v_year2 TEXT;
  v_code TEXT;
  v_existing_id UUID;
  v_num_str TEXT;
BEGIN
  -- Check if already issued
  SELECT id INTO v_existing_id FROM public.certificates WHERE user_id = p_user_id AND training_id = p_training_id;
  IF v_existing_id IS NOT NULL THEN
    SELECT verification_code, certificate_number INTO v_code, v_cert_num FROM public.certificates WHERE id = v_existing_id;
    RETURN jsonb_build_object('status', 'exists', 'verification_code', v_code, 'certificate_number', v_cert_num);
  END IF;

  -- Generate 10-char random uppercase verification code
  v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 10));

  -- Get certificate settings
  SELECT * INTO v_settings FROM public.certificate_settings WHERE training_id = p_training_id FOR UPDATE;

  IF FOUND AND v_settings.certificate_enabled AND v_settings.numbering_enabled THEN
    v_next_num := COALESCE(v_settings.current_number, v_settings.start_number, 1);
    
    v_year := to_char(NOW(), 'YYYY');
    v_year2 := to_char(NOW(), 'YY');
    v_month := to_char(NOW(), 'MM');
    
    CASE v_month
      WHEN '01' THEN v_roman_month := 'I';
      WHEN '02' THEN v_roman_month := 'II';
      WHEN '03' THEN v_roman_month := 'III';
      WHEN '04' THEN v_roman_month := 'IV';
      WHEN '05' THEN v_roman_month := 'V';
      WHEN '06' THEN v_roman_month := 'VI';
      WHEN '07' THEN v_roman_month := 'VII';
      WHEN '08' THEN v_roman_month := 'VIII';
      WHEN '09' THEN v_roman_month := 'IX';
      WHEN '10' THEN v_roman_month := 'X';
      WHEN '11' THEN v_roman_month := 'XI';
      WHEN '12' THEN v_roman_month := 'XII';
    END CASE;

    v_num_str := lpad(v_next_num::text, COALESCE(v_settings.number_digits, 4), '0');
    v_cert_num := COALESCE(v_settings.number_format, '{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}');
    
    v_cert_num := replace(v_cert_num, '{NO}', v_num_str);
    v_cert_num := replace(v_cert_num, '{TAHUN}', v_year);
    v_cert_num := replace(v_cert_num, '{TAHUN2}', v_year2);
    v_cert_num := replace(v_cert_num, '{BULAN}', v_month);
    v_cert_num := replace(v_cert_num, '{BULAN_ROMAWI}', v_roman_month);

    UPDATE public.certificate_settings 
    SET current_number = v_next_num + 1, updated_at = NOW() 
    WHERE id = v_settings.id;
  END IF;

  INSERT INTO public.certificates (user_id, training_id, certificate_number, verification_code, posttest_score, issued_at)
  VALUES (p_user_id, p_training_id, v_cert_num, v_code, p_score, NOW());

  RETURN jsonb_build_object('status', 'success', 'verification_code', v_code, 'certificate_number', v_cert_num);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fail closed untuk instalasi baru. Policy/RPC least-privilege yang membuat
-- aplikasi berfungsi dipasang oleh security_hardening.sql setelah schema ini.
DROP POLICY "Allow public read trainings" ON public.trainings;
DROP POLICY "Allow insert trainings" ON public.trainings;
DROP POLICY "Allow update trainings" ON public.trainings;
DROP POLICY "Allow delete trainings" ON public.trainings;
DROP POLICY "Allow public read materials" ON public.materials;
DROP POLICY "Allow insert materials" ON public.materials;
DROP POLICY "Allow update materials" ON public.materials;
DROP POLICY "Allow delete materials" ON public.materials;
DROP POLICY "Allow public read questions" ON public.questions;
DROP POLICY "Allow insert questions" ON public.questions;
DROP POLICY "Allow update questions" ON public.questions;
DROP POLICY "Allow delete questions" ON public.questions;
DROP POLICY "Allow public read certificate_settings" ON public.certificate_settings;
DROP POLICY "Allow insert certificate_settings" ON public.certificate_settings;
DROP POLICY "Allow update certificate_settings" ON public.certificate_settings;
DROP POLICY "Allow delete certificate_settings" ON public.certificate_settings;
DROP POLICY "Allow read profiles" ON public.profiles;
DROP POLICY "Allow insert profiles" ON public.profiles;
DROP POLICY "Allow update profiles" ON public.profiles;
DROP POLICY "Allow delete profiles" ON public.profiles;
DROP POLICY "Allow read test_attempts" ON public.test_attempts;
DROP POLICY "Allow insert test_attempts" ON public.test_attempts;
DROP POLICY "Allow update test_attempts" ON public.test_attempts;
DROP POLICY "Allow delete test_attempts" ON public.test_attempts;
DROP POLICY "Allow read material_progress" ON public.material_progress;
DROP POLICY "Allow insert material_progress" ON public.material_progress;
DROP POLICY "Allow update material_progress" ON public.material_progress;
DROP POLICY "Allow delete material_progress" ON public.material_progress;
DROP POLICY "Allow read certificates" ON public.certificates;
DROP POLICY "Allow insert certificates" ON public.certificates;
DROP POLICY "Allow update certificates" ON public.certificates;
DROP POLICY "Allow delete certificates" ON public.certificates;
REVOKE ALL ON TABLE public.profiles, public.trainings, public.materials,
  public.questions, public.test_attempts, public.material_progress,
  public.certificate_settings, public.certificates FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_certificate(UUID, UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.issue_certificate(UUID, UUID, NUMERIC);
