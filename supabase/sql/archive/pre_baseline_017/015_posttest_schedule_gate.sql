-- Jadwal pembukaan Post-Test per pelatihan.
-- Migrasi ini juga menyertakan lms_server_now() sehingga aman dijalankan walau 014 belum dijalankan.
-- Aman dijalankan ulang melalui Supabase SQL Editor.

BEGIN;

ALTER TABLE public.trainings
  ADD COLUMN IF NOT EXISTS posttest_start_at TIMESTAMPTZ;

COMMENT ON COLUMN public.trainings.posttest_start_at IS
  'Waktu server saat Post-Test mulai dapat dibuka. NULL berarti langsung tersedia setelah seluruh materi selesai.';

-- Disertakan kembali agar pengguna yang belum menjalankan migrasi 014 tetap mendapat sinkronisasi waktu server.
CREATE OR REPLACE FUNCTION public.lms_server_now()
RETURNS TIMESTAMPTZ
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT clock_timestamp();
$$;

REVOKE ALL ON FUNCTION public.lms_server_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lms_server_now() TO authenticated;

-- Sesi tes hanya dapat dimulai setelah semua prasyarat terpenuhi dan,
-- khusus Post-Test, setelah jadwal pembukaan admin tercapai.
CREATE OR REPLACE FUNCTION public.start_test_session(p_training_id UUID, p_test_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session public.test_sessions%ROWTYPE;
  v_attempt INT;
  v_training public.trainings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'peserta') THEN
    RAISE EXCEPTION 'Akses hanya untuk peserta';
  END IF;
  IF p_test_type NOT IN ('pretest', 'posttest') THEN RAISE EXCEPTION 'Jenis tes tidak valid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::TEXT || ':' || p_training_id::TEXT || ':' || p_test_type, 0));

  SELECT * INTO v_training FROM public.trainings
  WHERE id = p_training_id AND active
    AND (start_date IS NULL OR start_date <= now()) AND (end_date IS NULL OR end_date >= now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak aktif atau di luar periode'; END IF;

  IF p_test_type = 'posttest'
     AND v_training.posttest_start_at IS NOT NULL
     AND clock_timestamp() < v_training.posttest_start_at THEN
    RAISE EXCEPTION 'Post-Test belum dibuka oleh admin. Silakan tunggu sampai waktu yang ditentukan.';
  END IF;

  SELECT * INTO v_session FROM public.test_sessions
  WHERE user_id = auth.uid() AND training_id = p_training_id
    AND test_type = p_test_type AND status = 'in_progress' LIMIT 1;
  IF FOUND THEN RETURN to_jsonb(v_session); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.training_id = p_training_id AND q.test_type = p_test_type AND q.active) THEN
    RAISE EXCEPTION 'Soal belum tersedia';
  END IF;
  SELECT count(*) + 1 INTO v_attempt FROM public.test_attempts a
  WHERE a.user_id = auth.uid() AND a.training_id = p_training_id AND a.test_type = p_test_type;
  IF p_test_type = 'pretest' AND v_attempt > 1 THEN RAISE EXCEPTION 'Pre-Test sudah pernah diselesaikan'; END IF;
  IF p_test_type = 'posttest' THEN
    IF NOT EXISTS (SELECT 1 FROM public.test_attempts a WHERE a.user_id = auth.uid() AND a.training_id = p_training_id AND a.test_type = 'pretest') THEN
      RAISE EXCEPTION 'Selesaikan Pre-Test terlebih dahulu';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.materials m
      WHERE m.training_id = p_training_id AND m.active
        AND NOT EXISTS (
          SELECT 1 FROM public.material_progress mp
          WHERE mp.user_id = auth.uid() AND mp.material_id = m.id AND mp.completed_at IS NOT NULL
        )
    ) THEN RAISE EXCEPTION 'Selesaikan seluruh materi terlebih dahulu'; END IF;
    IF EXISTS (SELECT 1 FROM public.test_attempts a WHERE a.user_id = auth.uid() AND a.training_id = p_training_id AND a.test_type = 'posttest' AND a.score >= v_training.passing_score) THEN
      RAISE EXCEPTION 'Post-Test sudah lulus';
    END IF;
    IF v_attempt > LEAST(v_training.max_posttest_attempts, 5) THEN RAISE EXCEPTION 'Kesempatan Post-Test telah habis'; END IF;
  END IF;

  INSERT INTO public.test_sessions (user_id, training_id, test_type, attempt_number)
  VALUES (auth.uid(), p_training_id, p_test_type, v_attempt) RETURNING * INTO v_session;
  RETURN to_jsonb(v_session);
END;
$$;

-- Pertahankan proteksi juga pada RPC lama submit_test_attempt agar tidak dapat
-- dilewati dengan memanggil RPC secara langsung dari browser.
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
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'peserta'
  ) THEN RAISE EXCEPTION 'Akses hanya untuk peserta'; END IF;
  IF p_test_type NOT IN ('pretest', 'posttest') THEN RAISE EXCEPTION 'Jenis tes tidak valid'; END IF;
  IF jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'Format jawaban tidak valid'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::TEXT || ':' || p_training_id::TEXT || ':' || p_test_type, 0));

  SELECT * INTO v_training FROM public.trainings
  WHERE id = p_training_id AND active
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak aktif atau di luar periode'; END IF;

  IF p_test_type = 'posttest'
     AND v_training.posttest_start_at IS NOT NULL
     AND clock_timestamp() < v_training.posttest_start_at THEN
    RAISE EXCEPTION 'Post-Test belum dibuka oleh admin. Silakan tunggu sampai waktu yang ditentukan.';
  END IF;

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

    IF v_attempt > LEAST(v_training.max_posttest_attempts, 5) THEN RAISE EXCEPTION 'Kesempatan Post-Test telah habis'; END IF;
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
    BEGIN
      v_certificate := private.issue_lms_certificate(auth.uid(), p_training_id, v_score);
    EXCEPTION WHEN OTHERS THEN
      v_certificate := FALSE;
    END;
  END IF;

  RETURN jsonb_build_object(
    'score', v_score,
    'attempt_number', v_attempt,
    'passed', v_passed,
    'certificate_issued', v_certificate
  );
END;
$$;

-- Sesi yang sudah terlanjur dibuat sebelum admin mengubah jadwal tetap tidak
-- dapat dikirim sebelum waktu pembukaan tercapai.
CREATE OR REPLACE FUNCTION public.submit_test_session(p_session_id UUID, p_answers JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session public.test_sessions%ROWTYPE;
  v_result JSONB;
  v_posttest_start_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_session FROM public.test_sessions
  WHERE id = p_session_id AND user_id = auth.uid() AND status = 'in_progress' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tes tidak ditemukan atau sudah selesai'; END IF;

  IF v_session.test_type = 'posttest' THEN
    SELECT t.posttest_start_at INTO v_posttest_start_at
    FROM public.trainings t WHERE t.id = v_session.training_id;
    IF v_posttest_start_at IS NOT NULL AND clock_timestamp() < v_posttest_start_at THEN
      RAISE EXCEPTION 'Post-Test belum dibuka oleh admin. Silakan tunggu sampai waktu yang ditentukan.';
    END IF;
  END IF;

  PERFORM private.validate_test_session_answers(v_session.training_id, v_session.test_type, p_answers);
  v_result := public.submit_test_attempt(v_session.training_id, v_session.test_type, p_answers);
  UPDATE public.test_attempts SET started_at = v_session.started_at
  WHERE user_id = auth.uid() AND training_id = v_session.training_id AND test_type = v_session.test_type
    AND attempt_number = (v_result ->> 'attempt_number')::INT;
  UPDATE public.test_sessions
  SET answers = p_answers, status = 'submitted', updated_at = now(), submitted_at = now()
  WHERE id = p_session_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.start_test_session(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_test_attempt(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_test_session(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_test_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_attempt(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_session(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
