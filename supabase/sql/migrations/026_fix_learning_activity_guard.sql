-- 026_fix_learning_activity_guard.sql
-- Memperbaiki guard struktur pembelajaran:
-- 1) Session kosong tidak dianggap sebagai aktivitas peserta.
-- 2) Struktur dikunci setelah ada jawaban tes, test attempt, atau progres materi.
-- 3) Helper private dijalankan melalui trigger SECURITY DEFINER agar tidak gagal permission.
-- 4) Session tes kosong dibersihkan saat struktur soal berubah agar snapshot lama tidak tertinggal.

BEGIN;

CREATE OR REPLACE FUNCTION private.training_has_participant_activity(p_training_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.test_attempts a
      WHERE a.training_id = p_training_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.test_sessions s
      WHERE s.training_id = p_training_id
        AND s.answers IS NOT NULL
        AND jsonb_typeof(s.answers) = 'object'
        AND s.answers <> '{}'::jsonb
    )
    OR EXISTS (
      SELECT 1
      FROM public.material_progress mp
      JOIN public.materials m ON m.id = mp.material_id
      WHERE m.training_id = p_training_id
    );
$$;

REVOKE ALL ON FUNCTION private.training_has_participant_activity(UUID)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_question_bank_after_training_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
    RAISE EXCEPTION 'Bank soal tidak dapat diubah karena peserta sudah mulai mengerjakan pelatihan';
  END IF;

  -- Session kosong bukan aktivitas belajar. Buang session/snapshot kosong agar
  -- peserta berikutnya selalu mendapat struktur soal terbaru.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM public.test_sessions s
    WHERE s.training_id = OLD.training_id
      AND s.status = 'in_progress'
      AND (s.answers IS NULL OR s.answers = '{}'::jsonb);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND (TG_OP = 'INSERT' OR NEW.training_id IS DISTINCT FROM OLD.training_id) THEN
    DELETE FROM public.test_sessions s
    WHERE s.training_id = NEW.training_id
      AND s.status = 'in_progress'
      AND (s.answers IS NULL OR s.answers = '{}'::jsonb);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_material_structure_after_training_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
      RAISE EXCEPTION 'Struktur materi tidak dapat ditambah karena peserta sudah mulai mengerjakan pelatihan';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_old_started THEN
      RAISE EXCEPTION 'Materi tidak dapat dihapus karena peserta sudah mulai mengerjakan pelatihan';
    END IF;
    RETURN OLD;
  END IF;

  IF v_old_started OR v_new_started THEN
    IF NEW.training_id IS DISTINCT FROM OLD.training_id
       OR NEW.order_number IS DISTINCT FROM OLD.order_number
       OR NEW.active IS DISTINCT FROM OLD.active THEN
      RAISE EXCEPTION 'Urutan/status/pelatihan materi tidak dapat diubah karena peserta sudah mulai mengerjakan pelatihan';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_question_bank_after_training_started()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_material_structure_after_training_started()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
