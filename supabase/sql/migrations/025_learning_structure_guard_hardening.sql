-- 025_learning_structure_guard_hardening.sql
-- Memperketat guard 022/023 agar UPDATE yang memindahkan materi/soal antar pelatihan
-- tidak dapat melewati pembekuan struktur pada pelatihan asal maupun tujuan.

BEGIN;

CREATE OR REPLACE FUNCTION private.training_has_participant_activity(p_training_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.test_sessions s WHERE s.training_id = p_training_id
    UNION ALL
    SELECT 1 FROM public.test_attempts a WHERE a.training_id = p_training_id
    LIMIT 1
  );
$$;

REVOKE ALL ON FUNCTION private.training_has_participant_activity(UUID)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_question_bank_after_training_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_started BOOLEAN := FALSE;
  v_new_started BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_started := private.training_has_participant_activity(OLD.training_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_started := private.training_has_participant_activity(NEW.training_id);
  END IF;

  IF v_old_started OR v_new_started THEN
    RAISE EXCEPTION 'Bank soal tidak dapat diubah karena pelatihan sudah mulai diikuti peserta';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_question_bank_after_training_started ON public.questions;
CREATE TRIGGER guard_question_bank_after_training_started
BEFORE INSERT OR UPDATE OR DELETE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION private.guard_question_bank_after_training_started();

CREATE OR REPLACE FUNCTION private.guard_material_structure_after_training_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old_started BOOLEAN := FALSE;
  v_new_started BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_started := private.training_has_participant_activity(OLD.training_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_started := private.training_has_participant_activity(NEW.training_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_new_started THEN
      RAISE EXCEPTION 'Struktur materi tidak dapat ditambah karena pelatihan sudah mulai diikuti peserta';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_old_started THEN
      RAISE EXCEPTION 'Materi tidak dapat dihapus karena pelatihan sudah mulai diikuti peserta';
    END IF;
    RETURN OLD;
  END IF;

  IF v_old_started OR v_new_started THEN
    IF NEW.training_id IS DISTINCT FROM OLD.training_id
       OR NEW.order_number IS DISTINCT FROM OLD.order_number
       OR NEW.active IS DISTINCT FROM OLD.active THEN
      RAISE EXCEPTION 'Urutan/status/pelatihan materi tidak dapat diubah karena pelatihan sudah mulai diikuti peserta';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_material_structure_after_training_started ON public.materials;
CREATE TRIGGER guard_material_structure_after_training_started
BEFORE INSERT OR UPDATE OR DELETE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION private.guard_material_structure_after_training_started();

REVOKE ALL ON FUNCTION private.guard_question_bank_after_training_started()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_material_structure_after_training_started()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
