-- ============================================================
-- LMS SECURITY HARDENING MIGRATION
-- Jalankan satu kali di Supabase SQL Editor setelah schema.sql.
-- Seluruh perubahan dibungkus transaksi agar gagal secara utuh.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Helper pemeriksaan admin disimpan di schema non-API untuk mencegah
-- recursive RLS dan tidak dapat dipanggil langsung melalui Data API.
CREATE OR REPLACE FUNCTION private.is_lms_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION private.is_lms_admin(UUID) FROM PUBLIC, anon, authenticated;

-- Cegah pengguna menaikkan perannya sendiri menjadi admin.
CREATE OR REPLACE FUNCTION private.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_lms_admin(auth.uid()) THEN
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'Profil hanya dapat diubah oleh pemilik akun';
    END IF;
    NEW.role := 'peserta';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_trigger ON public.profiles;
CREATE TRIGGER protect_profile_role_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.protect_profile_role();

-- Profil peserta dibuat otomatis. Metadata role sengaja tidak dipercaya.
CREATE OR REPLACE FUNCTION private.handle_new_lms_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, institution, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'Peserta LMS'),
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'institution', ''), 'Belum diisi'),
    'peserta'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_lms ON auth.users;
CREATE TRIGGER on_auth_user_created_lms
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.handle_new_lms_user();

REVOKE ALL ON FUNCTION private.protect_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.handle_new_lms_user() FROM PUBLIC, anon, authenticated;

-- Integritas dan indeks untuk mencegah duplikasi/race condition.
CREATE UNIQUE INDEX IF NOT EXISTS material_progress_user_material_uidx
  ON public.material_progress (user_id, material_id);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_user_training_uidx
  ON public.certificates (user_id, training_id);
CREATE INDEX IF NOT EXISTS test_attempts_user_training_type_idx
  ON public.test_attempts (user_id, training_id, test_type);
CREATE INDEX IF NOT EXISTS materials_training_order_idx
  ON public.materials (training_id, order_number);
CREATE INDEX IF NOT EXISTS questions_training_type_active_idx
  ON public.questions (training_id, test_type, active);

-- Hapus seluruh policy lama yang permisif pada tabel LMS.
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'trainings', 'materials', 'questions',
        'test_attempts', 'material_progress',
        'certificate_settings', 'certificates'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', item.policyname, item.schemaname, item.tablename);
  END LOOP;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Profil: peserta hanya miliknya; admin dapat mengelola semua.
CREATE POLICY profiles_select_own_or_admin ON public.profiles
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id OR private.is_lms_admin());

CREATE POLICY profiles_insert_own_participant ON public.profiles
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = id AND role = 'peserta');

CREATE POLICY profiles_update_own_or_admin ON public.profiles
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id OR private.is_lms_admin())
WITH CHECK ((SELECT auth.uid()) = id OR private.is_lms_admin());

CREATE POLICY profiles_delete_admin ON public.profiles
FOR DELETE TO authenticated
USING (private.is_lms_admin());

-- Pelatihan dan materi aktif dapat dibaca pengguna login; semua mutasi admin.
CREATE POLICY trainings_select_authenticated ON public.trainings
FOR SELECT TO authenticated
USING (active OR private.is_lms_admin());
CREATE POLICY trainings_insert_admin ON public.trainings FOR INSERT TO authenticated
WITH CHECK (private.is_lms_admin());
CREATE POLICY trainings_update_admin ON public.trainings FOR UPDATE TO authenticated
USING (private.is_lms_admin()) WITH CHECK (private.is_lms_admin());
CREATE POLICY trainings_delete_admin ON public.trainings FOR DELETE TO authenticated
USING (private.is_lms_admin());

CREATE POLICY materials_select_authenticated ON public.materials
FOR SELECT TO authenticated
USING (
  private.is_lms_admin()
  OR (active AND EXISTS (
    SELECT 1 FROM public.trainings t
    WHERE t.id = training_id AND t.active
  ))
);
CREATE POLICY materials_insert_admin ON public.materials FOR INSERT TO authenticated
WITH CHECK (private.is_lms_admin());
CREATE POLICY materials_update_admin ON public.materials FOR UPDATE TO authenticated
USING (private.is_lms_admin()) WITH CHECK (private.is_lms_admin());
CREATE POLICY materials_delete_admin ON public.materials FOR DELETE TO authenticated
USING (private.is_lms_admin());

-- Bank soal lengkap (termasuk kunci) hanya dapat diakses admin.
CREATE POLICY questions_admin_all ON public.questions
FOR ALL TO authenticated
USING (private.is_lms_admin())
WITH CHECK (private.is_lms_admin());

-- Hasil, progres, dan sertifikat hanya milik sendiri atau admin.
CREATE POLICY attempts_select_own_or_admin ON public.test_attempts
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id OR private.is_lms_admin());

CREATE POLICY progress_select_own_or_admin ON public.material_progress
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id OR private.is_lms_admin());

CREATE POLICY certificates_select_own_or_admin ON public.certificates
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id OR private.is_lms_admin());

CREATE POLICY certificate_settings_select_authenticated ON public.certificate_settings
FOR SELECT TO authenticated USING (true);
CREATE POLICY certificate_settings_insert_admin ON public.certificate_settings FOR INSERT TO authenticated
WITH CHECK (private.is_lms_admin());
CREATE POLICY certificate_settings_update_admin ON public.certificate_settings FOR UPDATE TO authenticated
USING (private.is_lms_admin()) WITH CHECK (private.is_lms_admin());
CREATE POLICY certificate_settings_delete_admin ON public.certificate_settings FOR DELETE TO authenticated
USING (private.is_lms_admin());

-- Batasi grant tabel. Penilaian/progres/sertifikat ditulis hanya lewat RPC.
REVOKE ALL ON TABLE public.profiles, public.trainings, public.materials,
  public.questions, public.test_attempts, public.material_progress,
  public.certificate_settings, public.certificates FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT SELECT ON public.test_attempts, public.material_progress, public.certificates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificate_settings TO authenticated;

-- Peserta menerima soal tanpa kolom correct_answer.
CREATE OR REPLACE FUNCTION public.get_test_questions(
  p_training_id UUID,
  p_test_type TEXT
)
RETURNS TABLE (
  id UUID,
  training_id UUID,
  test_type TEXT,
  question TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  IF p_test_type NOT IN ('pretest', 'posttest') THEN RAISE EXCEPTION 'Jenis tes tidak valid'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trainings t
    WHERE t.id = p_training_id AND t.active
      AND (t.start_date IS NULL OR t.start_date <= now())
      AND (t.end_date IS NULL OR t.end_date >= now())
  ) THEN
    RAISE EXCEPTION 'Pelatihan tidak aktif atau di luar periode';
  END IF;

  IF p_test_type = 'posttest' AND EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.training_id = p_training_id AND m.active
      AND NOT EXISTS (
        SELECT 1 FROM public.material_progress mp
        WHERE mp.user_id = auth.uid() AND mp.material_id = m.id AND mp.completed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Selesaikan seluruh materi sebelum membuka Post-Test';
  END IF;

  RETURN QUERY
  SELECT q.id, q.training_id, q.test_type, q.question,
         q.option_a, q.option_b, q.option_c, q.option_d, q.active
  FROM public.questions q
  WHERE q.training_id = p_training_id
    AND q.test_type = p_test_type
    AND q.active
  ORDER BY q.id;
END;
$$;

-- Mulai materi dengan waktu server dan validasi urutan.
CREATE OR REPLACE FUNCTION public.start_material_progress(p_material_id UUID)
RETURNS public.material_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_material public.materials%ROWTYPE;
  v_previous UUID;
  v_progress public.material_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;

  SELECT m.* INTO v_material
  FROM public.materials m JOIN public.trainings t ON t.id = m.training_id
  WHERE m.id = p_material_id AND m.active AND t.active
    AND (t.start_date IS NULL OR t.start_date <= now())
    AND (t.end_date IS NULL OR t.end_date >= now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Materi tidak tersedia'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.test_attempts a
    WHERE a.user_id = auth.uid() AND a.training_id = v_material.training_id AND a.test_type = 'pretest'
  ) THEN RAISE EXCEPTION 'Selesaikan Pre-Test terlebih dahulu'; END IF;

  SELECT m.id INTO v_previous FROM public.materials m
  WHERE m.training_id = v_material.training_id AND m.active
    AND (m.order_number < v_material.order_number OR (m.order_number = v_material.order_number AND m.id < v_material.id))
  ORDER BY m.order_number DESC, m.id DESC LIMIT 1;

  IF v_previous IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.material_progress mp
    WHERE mp.user_id = auth.uid() AND mp.material_id = v_previous AND mp.completed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Selesaikan materi sebelumnya terlebih dahulu'; END IF;

  INSERT INTO public.material_progress (user_id, material_id, started_at)
  VALUES (auth.uid(), p_material_id, now())
  ON CONFLICT (user_id, material_id) DO NOTHING;

  SELECT * INTO v_progress FROM public.material_progress
  WHERE user_id = auth.uid() AND material_id = p_material_id;
  RETURN v_progress;
END;
$$;

-- Penyelesaian materi memakai waktu server sehingga timer tidak dapat dilewati.
CREATE OR REPLACE FUNCTION public.complete_material_progress(p_material_id UUID)
RETURNS public.material_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_progress public.material_progress%ROWTYPE;
  v_duration INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  SELECT * INTO v_progress
  FROM public.material_progress
  WHERE user_id = auth.uid() AND material_id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Materi belum dimulai'; END IF;

  SELECT minimum_duration_seconds INTO v_duration
  FROM public.materials
  WHERE id = p_material_id;

  IF v_progress.completed_at IS NULL
     AND now() < v_progress.started_at + make_interval(secs => GREATEST(v_duration, 0)) THEN
    RAISE EXCEPTION 'Durasi minimum materi belum terpenuhi';
  END IF;

  UPDATE public.material_progress
  SET completed_at = COALESCE(completed_at, now())
  WHERE id = v_progress.id
  RETURNING * INTO v_progress;
  RETURN v_progress;
END;
$$;

-- Penerbitan sertifikat internal dan atomik.
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
BEGIN
  IF EXISTS (SELECT 1 FROM public.certificates c WHERE c.user_id = p_user_id AND c.training_id = p_training_id) THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_settings FROM public.certificate_settings
  WHERE training_id = p_training_id FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.certificate_enabled THEN RETURN FALSE; END IF;

  IF v_settings.numbering_enabled THEN
    v_next := COALESCE(v_settings.current_number, v_settings.start_number, 1);
    v_month := to_char(now(), 'MM');
    v_roman := (ARRAY['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[v_month::INTEGER];
    v_number := COALESCE(v_settings.number_format, '{NO}/SERT/{TAHUN}');
    v_number := replace(v_number, '{NO}', lpad(v_next::TEXT, COALESCE(v_settings.number_digits, 4), '0'));
    v_number := replace(v_number, '{TAHUN}', to_char(now(), 'YYYY'));
    v_number := replace(v_number, '{TAHUN2}', to_char(now(), 'YY'));
    v_number := replace(v_number, '{BULAN}', v_month);
    v_number := replace(v_number, '{BULAN_ROMAWI}', v_roman);
    UPDATE public.certificate_settings
      SET current_number = v_next + 1, updated_at = now()
      WHERE id = v_settings.id;
  END IF;

  LOOP
    v_code := upper(substr(md5(gen_random_uuid()::TEXT || clock_timestamp()::TEXT), 1, 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.verification_code = v_code);
  END LOOP;

  INSERT INTO public.certificates (
    user_id, training_id, certificate_number, verification_code, issued_at, posttest_score
  ) VALUES (p_user_id, p_training_id, v_number, v_code, now(), p_score)
  ON CONFLICT (user_id, training_id) DO NOTHING;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION private.issue_lms_certificate(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- Penilaian berlangsung di database; browser tidak pernah menerima kunci.
CREATE OR REPLACE FUNCTION public.submit_test_attempt(
  p_training_id UUID,
  p_test_type TEXT,
  p_answers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_training public.trainings%ROWTYPE;
  v_total INTEGER;
  v_answered INTEGER;
  v_correct INTEGER;
  v_attempt INTEGER;
  v_score NUMERIC;
  v_passed BOOLEAN;
  v_certificate BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  IF p_test_type NOT IN ('pretest', 'posttest') THEN RAISE EXCEPTION 'Jenis tes tidak valid'; END IF;
  IF jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'Format jawaban tidak valid'; END IF;

  SELECT * INTO v_training FROM public.trainings
  WHERE id = p_training_id AND active
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak aktif atau di luar periode'; END IF;

  SELECT count(*) INTO v_total FROM public.questions q
  WHERE q.training_id = p_training_id AND q.test_type = p_test_type AND q.active;
  IF v_total = 0 THEN RAISE EXCEPTION 'Soal belum tersedia'; END IF;

  SELECT count(*) INTO v_answered FROM public.questions q
  WHERE q.training_id = p_training_id AND q.test_type = p_test_type AND q.active
    AND p_answers ? q.id::TEXT
    AND upper(p_answers ->> q.id::TEXT) IN ('A','B','C','D');
  IF v_answered <> v_total THEN RAISE EXCEPTION 'Seluruh soal wajib dijawab'; END IF;

  SELECT count(*) + 1 INTO v_attempt FROM public.test_attempts a
  WHERE a.user_id = auth.uid() AND a.training_id = p_training_id AND a.test_type = p_test_type;

  IF p_test_type = 'pretest' AND v_attempt > 1 THEN
    RAISE EXCEPTION 'Pre-Test sudah pernah diselesaikan';
  END IF;

  IF p_test_type = 'posttest' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.test_attempts a
      WHERE a.user_id = auth.uid() AND a.training_id = p_training_id AND a.test_type = 'pretest'
    ) THEN RAISE EXCEPTION 'Selesaikan Pre-Test terlebih dahulu'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.materials m
      WHERE m.training_id = p_training_id AND m.active
        AND NOT EXISTS (
          SELECT 1 FROM public.material_progress mp
          WHERE mp.user_id = auth.uid() AND mp.material_id = m.id AND mp.completed_at IS NOT NULL
        )
    ) THEN RAISE EXCEPTION 'Selesaikan seluruh materi terlebih dahulu'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.test_attempts a
      WHERE a.user_id = auth.uid() AND a.training_id = p_training_id
        AND a.test_type = 'posttest' AND a.score >= v_training.passing_score
    ) THEN RAISE EXCEPTION 'Post-Test sudah lulus'; END IF;

    IF v_attempt > v_training.max_posttest_attempts THEN RAISE EXCEPTION 'Kesempatan Post-Test telah habis'; END IF;
  END IF;

  SELECT count(*) INTO v_correct FROM public.questions q
  WHERE q.training_id = p_training_id AND q.test_type = p_test_type AND q.active
    AND upper(p_answers ->> q.id::TEXT) = q.correct_answer;
  v_score := round((v_correct::NUMERIC / v_total::NUMERIC) * 100);
  v_passed := p_test_type = 'posttest' AND v_score >= v_training.passing_score;

  INSERT INTO public.test_attempts (
    user_id, training_id, test_type, score, attempt_number, started_at, submitted_at
  ) VALUES (auth.uid(), p_training_id, p_test_type, v_score, v_attempt, now(), now());

  IF v_passed THEN
    v_certificate := private.issue_lms_certificate(auth.uid(), p_training_id, v_score);
  END IF;

  RETURN jsonb_build_object(
    'score', v_score,
    'attempt_number', v_attempt,
    'passed', v_passed,
    'certificate_issued', v_certificate
  );
END;
$$;

-- Verifikasi publik hanya mengembalikan informasi yang memang tercetak.
CREATE OR REPLACE FUNCTION public.verify_certificate(p_code TEXT)
RETURNS TABLE (
  certificate_number TEXT,
  verification_code TEXT,
  issued_at TIMESTAMPTZ,
  posttest_score NUMERIC,
  user_name TEXT,
  user_institution TEXT,
  training_title TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.certificate_number, c.verification_code, c.issued_at, c.posttest_score,
         p.full_name, p.institution, t.title
  FROM public.certificates c
  JOIN public.profiles p ON p.id = c.user_id
  JOIN public.trainings t ON t.id = c.training_id
  WHERE c.verification_code = upper(trim(p_code))
  LIMIT 1;
$$;

-- Fungsi lama tidak aman karena menerima user dan nilai dari browser.
DROP FUNCTION IF EXISTS public.issue_certificate(UUID, UUID, NUMERIC);

REVOKE ALL ON FUNCTION public.get_test_questions(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_material_progress(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_material_progress(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_test_attempt(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_test_questions(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_material_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_material_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_attempt(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;

COMMIT;
