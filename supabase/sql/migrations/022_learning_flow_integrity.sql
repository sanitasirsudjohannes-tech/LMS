-- 022_learning_flow_integrity.sql
-- Menstabilkan alur Pre-Test -> Materi -> Post-Test -> Review -> Sertifikat.
-- 1) Soal disnapshot per sesi agar perubahan bank soal tidak merusak sesi aktif.
-- 2) Struktur materi dikunci setelah peserta mulai pelatihan.
-- 3) Submit Post-Test tidak lagi mencoba menerbitkan sertifikat sebelum review.

BEGIN;

ALTER TABLE public.test_sessions
  ADD COLUMN IF NOT EXISTS question_snapshot JSONB;

COMMENT ON COLUMN public.test_sessions.question_snapshot IS
  'Snapshot soal lengkap (termasuk kunci jawaban) pada saat sesi dimulai; tidak diekspos langsung ke peserta.';

CREATE OR REPLACE FUNCTION private.build_test_question_snapshot(
  p_training_id UUID,
  p_test_type TEXT
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'training_id', q.training_id,
        'test_type', q.test_type,
        'question', q.question,
        'option_a', q.option_a,
        'option_b', q.option_b,
        'option_c', q.option_c,
        'option_d', q.option_d,
        'correct_answer', upper(q.correct_answer),
        'active', true
      )
      ORDER BY q.id
    ),
    '[]'::jsonb
  )
  FROM public.questions q
  WHERE q.training_id = p_training_id
    AND q.test_type = p_test_type
    AND q.active;
$$;

REVOKE ALL ON FUNCTION private.build_test_question_snapshot(UUID, TEXT)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_test_session_questions(p_session_id UUID)
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
DECLARE
  v_session public.test_sessions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autentikasi diperlukan'; END IF;

  SELECT * INTO v_session
  FROM public.test_sessions s
  WHERE s.id = p_session_id
    AND s.user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tes tidak ditemukan'; END IF;

  RETURN QUERY
  SELECT
    (item->>'id')::UUID,
    (item->>'training_id')::UUID,
    item->>'test_type',
    item->>'question',
    item->>'option_a',
    item->>'option_b',
    item->>'option_c',
    item->>'option_d',
    true
  FROM jsonb_array_elements(COALESCE(v_session.question_snapshot, '[]'::jsonb)) item;
END;
$$;

REVOKE ALL ON FUNCTION public.get_test_session_questions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_test_session_questions(UUID) TO authenticated;

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
  v_required INT;
  v_source JSONB;
BEGIN
  IF jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'Format jawaban tidak valid';
  END IF;

  v_source := COALESCE(p_snapshot, private.build_test_question_snapshot(p_training_id, p_test_type));
  v_required := jsonb_array_length(v_source);
  IF v_required = 0 THEN RAISE EXCEPTION 'Soal belum tersedia'; END IF;

  SELECT count(*) INTO v_supplied FROM jsonb_each_text(p_answers);

  SELECT count(*) INTO v_valid
  FROM jsonb_each_text(p_answers) answer
  JOIN jsonb_array_elements(v_source) item
    ON item->>'id' = answer.key
  WHERE upper(answer.value) IN ('A','B','C','D');

  IF v_valid <> v_supplied THEN
    RAISE EXCEPTION 'Jawaban memuat soal atau pilihan yang tidak valid';
  END IF;

  IF v_supplied <> v_required THEN
    RAISE EXCEPTION 'Seluruh soal wajib dijawab';
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
    RETURN to_jsonb(v_session);
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

  RETURN to_jsonb(v_session);
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

  v_total := jsonb_array_length(v_session.question_snapshot);

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

  -- Sertifikat sengaja TIDAK diterbitkan di sini. Setelah lulus peserta wajib
  -- menyimpan review; trigger review/ensure_my_certificate menjadi satu-satunya jalur penerbitan.
  RETURN jsonb_build_object(
    'score', v_score,
    'attempt_number', v_session.attempt_number,
    'passed', v_passed,
    'certificate_issued', false
  );
END;
$$;

-- Jalur lama tidak dipakai aplikasi lagi; cabut akses peserta agar scoring selalu
-- melewati snapshot sesi yang konsisten.
REVOKE ALL ON FUNCTION public.submit_test_attempt(UUID, TEXT, JSONB) FROM authenticated;

REVOKE ALL ON FUNCTION public.start_test_session(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_test_session(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_test_session(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_test_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_test_session(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_session(UUID, JSONB) TO authenticated;

-- Setelah peserta mulai Pre-Test, struktur materi harus stabil. Konten/judul masih
-- boleh diperbaiki, tetapi admin tidak boleh menambah, menghapus, memindah urutan,
-- memindah pelatihan, atau mengubah status aktif materi.
CREATE OR REPLACE FUNCTION private.guard_material_structure_after_training_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_training_id UUID;
  v_started BOOLEAN;
BEGIN
  v_training_id := COALESCE(NEW.training_id, OLD.training_id);

  SELECT EXISTS (
    SELECT 1 FROM public.test_attempts a
    WHERE a.training_id = v_training_id AND a.test_type = 'pretest'
    UNION ALL
    SELECT 1 FROM public.test_sessions s
    WHERE s.training_id = v_training_id AND s.test_type = 'pretest'
    LIMIT 1
  ) INTO v_started;

  IF NOT v_started THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Struktur materi tidak dapat ditambah karena pelatihan sudah mulai diikuti peserta';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Materi tidak dapat dihapus karena pelatihan sudah mulai diikuti peserta';
  ELSIF NEW.training_id IS DISTINCT FROM OLD.training_id
     OR NEW.order_number IS DISTINCT FROM OLD.order_number
     OR NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'Urutan/status materi tidak dapat diubah karena pelatihan sudah mulai diikuti peserta';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_material_structure_after_training_started ON public.materials;
CREATE TRIGGER guard_material_structure_after_training_started
BEFORE INSERT OR UPDATE OR DELETE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION private.guard_material_structure_after_training_started();

REVOKE ALL ON FUNCTION private.guard_material_structure_after_training_started()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
