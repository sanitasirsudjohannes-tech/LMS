-- 023_question_structure_freeze.sql
-- Melengkapi 022: bank soal dibekukan setelah ada aktivitas peserta agar
-- tampilan, snapshot sesi, dan scoring tidak berubah di tengah pengerjaan.

BEGIN;

CREATE OR REPLACE FUNCTION private.guard_question_bank_after_training_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_training_id UUID;
  v_started BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_training_id := OLD.training_id;
  ELSE
    v_training_id := NEW.training_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.test_sessions s
    WHERE s.training_id = v_training_id
    UNION ALL
    SELECT 1
    FROM public.test_attempts a
    WHERE a.training_id = v_training_id
    LIMIT 1
  ) INTO v_started;

  IF v_started THEN
    RAISE EXCEPTION 'Bank soal tidak dapat diubah karena pelatihan sudah mulai diikuti peserta';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_question_bank_after_training_started ON public.questions;
CREATE TRIGGER guard_question_bank_after_training_started
BEFORE INSERT OR UPDATE OR DELETE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION private.guard_question_bank_after_training_started();

REVOKE ALL ON FUNCTION private.guard_question_bank_after_training_started()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
