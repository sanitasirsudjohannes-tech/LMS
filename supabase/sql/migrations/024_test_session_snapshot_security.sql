-- 024_test_session_snapshot_security.sql
-- Memperbaiki keamanan dan konsistensi sesi tes setelah 022/023.
-- 1) question_snapshot (yang berisi kunci jawaban) tidak pernah dikirim dari start_test_session.
-- 2) Autosave boleh menyimpan jawaban parsial; submit tetap wajib menjawab seluruh soal.
-- 3) Soal yang ditampilkan peserta diambil dari snapshot sesi tanpa correct_answer.

BEGIN;

CREATE OR REPLACE FUNCTION private.validate_test_session_answers(
  p_training_id UUID,
  p_test_type TEXT,
  p_answers JSONB,
  p_snapshot JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_supplied INT;
  v_valid INT;
  v_source JSONB;
BEGIN
  IF jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Format jawaban tidak valid';
  END IF;

  v_source := COALESCE(p_snapshot, private.build_test_question_snapshot(p_training_id, p_test_type));
  IF jsonb_array_length(v_source) = 0 THEN
    RAISE EXCEPTION 'Soal belum tersedia';
  END IF;

  SELECT count(*) INTO v_supplied FROM jsonb_each_text(p_answers);

  SELECT count(*) INTO v_valid
  FROM jsonb_each_text(p_answers) answer
  JOIN jsonb_array_elements(v_source) item
    ON item->>'id' = answer.key
  WHERE upper(answer.value) IN ('A','B','C','D');

  IF v_valid <> v_supplied THEN
    RAISE EXCEPTION 'Jawaban memuat soal atau pilihan yang tidak valid';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_test_session_answers(UUID, TEXT, JSONB, JSONB)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_test_session(p_training_id UUID, p_test_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.test_sessions%ROWTYPE;
  v_attempt INT;
  v_training public.trainings%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'peserta') THEN
    RAISE EXCEPTION 'Akses hanya untuk peserta';
  END IF;
  IF p_test_type NOT IN ('pretest', 'posttest') THEN RAISE EXCEPTION 'Jenis tes tidak valid'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::TEXT || ':' || p_training_id::TEXT || ':' || p_test_type, 0));

  SELECT * INTO v_training
  FROM public.trainings
  WHERE id = p_training_id
    AND active
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak aktif atau di luar periode'; END IF;

  IF p_test_type = 'posttest'
     AND v_training.posttest_start_at IS NOT NULL
     AND clock_timestamp() < v_training.posttest_start_at THEN
    RAISE EXCEPTION 'Post-Test belum dibuka oleh admin. Silakan tunggu sampai waktu yang ditentukan.';
  END IF;

  SELECT * INTO v_session
  FROM public.test_sessions
  WHERE user_id = auth.uid()
    AND training_id = p_training_id
    AND test_type = p_test_type
    AND status = 'in_progress'
  LIMIT 1;

  IF FOUND THEN
    IF v_session.question_snapshot IS NULL OR jsonb_array_length(v_session.question_snapshot) = 0 THEN
      v_snapshot := private.build_test_question_snapshot(p_training_id, p_test_type);
      IF jsonb_array_length(v_snapshot) = 0 THEN RAISE EXCEPTION 'Soal belum tersedia'; END IF;
      UPDATE public.test_sessions
      SET question_snapshot = v_snapshot, updated_at = now()
      WHERE id = v_session.id
      RETURNING * INTO v_session;
    END IF;
    RETURN to_jsonb(v_session) - 'question_snapshot';
  END IF;

  v_snapshot := private.build_test_question_snapshot(p_training_id, p_test_type);
  IF jsonb_array_length(v_snapshot) = 0 THEN RAISE EXCEPTION 'Soal belum tersedia'; END IF;

  SELECT count(*) + 1 INTO v_attempt
  FROM public.test_attempts a
  WHERE a.user_id = auth.uid()
    AND a.training_id = p_training_id
    AND a.test_type = p_test_type;

  IF p_test_type = 'pretest' AND v_attempt > 1 THEN
    RAISE EXCEPTION 'Pre-Test sudah pernah diselesaikan';
  END IF;

  IF p_test_type = 'posttest' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.test_attempts a
      WHERE a.user_id = auth.uid()
        AND a.training_id = p_training_id
        AND a.test_type = 'pretest'
    ) THEN RAISE EXCEPTION 'Selesaikan Pre-Test terlebih dahulu'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.materials m
      WHERE m.training_id = p_training_id
        AND m.active
        AND NOT EXISTS (
          SELECT 1 FROM public.material_progress mp
          WHERE mp.user_id = auth.uid()
            AND mp.material_id = m.id
            AND mp.completed_at IS NOT NULL
        )
    ) THEN RAISE EXCEPTION 'Selesaikan seluruh materi terlebih dahulu'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.test_attempts a
      WHERE a.user_id = auth.uid()
        AND a.training_id = p_training_id
        AND a.test_type = 'posttest'
        AND a.score >= v_training.passing_score
    ) THEN RAISE EXCEPTION 'Post-Test sudah lulus'; END IF;

    IF v_attempt > LEAST(v_training.max_posttest_attempts, 5) THEN
      RAISE EXCEPTION 'Kesempatan Post-Test telah habis';
    END IF;
  END IF;

  INSERT INTO public.test_sessions (
    user_id, training_id, test_type, attempt_number, question_snapshot
  ) VALUES (
    auth.uid(), p_training_id, p_test_type, v_attempt, v_snapshot
  ) RETURNING * INTO v_session;

  RETURN to_jsonb(v_session) - 'question_snapshot';
END;
$$;

CREATE OR REPLACE FUNCTION public.save_test_session(p_session_id UUID, p_answers JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.test_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.test_sessions
  WHERE id = p_session_id
    AND user_id = auth.uid()
    AND status = 'in_progress'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tes tidak ditemukan atau sudah selesai'; END IF;

  -- Autosave memang boleh parsial, tetapi setiap ID soal/pilihan tetap divalidasi.
  PERFORM private.validate_test_session_answers(
    v_session.training_id,
    v_session.test_type,
    p_answers,
    v_session.question_snapshot
  );

  UPDATE public.test_sessions
  SET answers = p_answers, updated_at = now()
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_test_session(p_session_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.test_sessions%ROWTYPE;
  v_training public.trainings%ROWTYPE;
  v_total INT;
  v_answered INT;
  v_correct INT;
  v_score NUMERIC;
  v_passed BOOLEAN;
BEGIN
  SELECT * INTO v_session
  FROM public.test_sessions
  WHERE id = p_session_id
    AND user_id = auth.uid()
    AND status = 'in_progress'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tes tidak ditemukan atau sudah selesai'; END IF;

  SELECT * INTO v_training
  FROM public.trainings
  WHERE id = v_session.training_id
    AND active
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelatihan tidak aktif atau di luar periode'; END IF;

  IF v_session.test_type = 'posttest'
     AND v_training.posttest_start_at IS NOT NULL
     AND clock_timestamp() < v_training.posttest_start_at THEN
    RAISE EXCEPTION 'Post-Test belum dibuka oleh admin. Silakan tunggu sampai waktu yang ditentukan.';
  END IF;

  PERFORM private.validate_test_session_answers(
    v_session.training_id,
    v_session.test_type,
    p_answers,
    v_session.question_snapshot
  );

  v_total := jsonb_array_length(v_session.question_snapshot);
  SELECT count(*) INTO v_answered FROM jsonb_each_text(p_answers);
  IF v_answered <> v_total THEN
    RAISE EXCEPTION 'Seluruh soal wajib dijawab';
  END IF;

  IF v_session.test_type = 'pretest' AND EXISTS (
    SELECT 1 FROM public.test_attempts a
    WHERE a.user_id = auth.uid()
      AND a.training_id = v_session.training_id
      AND a.test_type = 'pretest'
  ) THEN RAISE EXCEPTION 'Pre-Test sudah pernah diselesaikan'; END IF;

  IF v_session.test_type = 'posttest' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.test_attempts a
      WHERE a.user_id = auth.uid()
        AND a.training_id = v_session.training_id
        AND a.test_type = 'pretest'
    ) THEN RAISE EXCEPTION 'Selesaikan Pre-Test terlebih dahulu'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.materials m
      WHERE m.training_id = v_session.training_id
        AND m.active
        AND NOT EXISTS (
          SELECT 1 FROM public.material_progress mp
          WHERE mp.user_id = auth.uid()
            AND mp.material_id = m.id
            AND mp.completed_at IS NOT NULL
        )
    ) THEN RAISE EXCEPTION 'Selesaikan seluruh materi terlebih dahulu'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.test_attempts a
      WHERE a.user_id = auth.uid()
        AND a.training_id = v_session.training_id
        AND a.test_type = 'posttest'
        AND a.score >= v_training.passing_score
    ) THEN RAISE EXCEPTION 'Post-Test sudah lulus'; END IF;

    IF v_session.attempt_number > LEAST(v_training.max_posttest_attempts, 5) THEN
      RAISE EXCEPTION 'Kesempatan Post-Test telah habis';
    END IF;
  END IF;

  SELECT count(*) INTO v_correct
  FROM jsonb_array_elements(v_session.question_snapshot) item
  WHERE upper(p_answers ->> (item->>'id')) = upper(item->>'correct_answer');

  v_score := round((v_correct::NUMERIC / v_total::NUMERIC) * 100);
  v_passed := v_session.test_type = 'posttest' AND v_score >= v_training.passing_score;

  INSERT INTO public.test_attempts (
    user_id, training_id, test_type, score, attempt_number, started_at, submitted_at
  ) VALUES (
    auth.uid(), v_session.training_id, v_session.test_type, v_score,
    v_session.attempt_number, v_session.started_at, now()
  );

  UPDATE public.test_sessions
  SET answers = p_answers,
      status = 'submitted',
      updated_at = now(),
      submitted_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'score', v_score,
    'attempt_number', v_session.attempt_number,
    'passed', v_passed,
    'certificate_issued', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_test_session(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_test_session(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_test_session(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_test_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_test_session(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_session(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
