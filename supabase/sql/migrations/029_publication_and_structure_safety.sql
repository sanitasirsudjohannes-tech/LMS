-- 029_publication_and_structure_safety.sql
-- Prioritas keamanan publikasi dan konsistensi struktur pelatihan.
-- Jalankan setelah migration 028.
--
-- 1) Pelatihan hanya dapat dipublikasikan jika checklist kesiapan 9/9.
-- 2) Setelah ada aktivitas nyata peserta, seluruh isi materi + durasi dikunci.
-- 3) Passing grade dan maksimal percobaan Post-Test dikunci setelah peserta mulai.
-- 4) Menyediakan status lock untuk UI admin agar dapat menampilkan peringatan.

BEGIN;

-- Kunci SELURUH perubahan materi setelah aktivitas peserta dimulai,
-- bukan hanya urutan/status seperti guard sebelumnya.
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
      RAISE EXCEPTION 'Materi tidak dapat ditambah karena peserta sudah mulai mengikuti pelatihan';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_old_started THEN
      RAISE EXCEPTION 'Materi tidak dapat dihapus karena peserta sudah mulai mengikuti pelatihan';
    END IF;
    RETURN OLD;
  END IF;

  IF v_old_started OR v_new_started THEN
    IF NEW.training_id IS DISTINCT FROM OLD.training_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.content_url IS DISTINCT FROM OLD.content_url
       OR NEW.minimum_duration_seconds IS DISTINCT FROM OLD.minimum_duration_seconds
       OR NEW.order_number IS DISTINCT FROM OLD.order_number
       OR NEW.active IS DISTINCT FROM OLD.active THEN
      RAISE EXCEPTION 'Materi, konten, durasi, urutan, dan status tidak dapat diubah karena peserta sudah mulai mengikuti pelatihan';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_material_structure_after_training_started()
FROM PUBLIC, anon, authenticated;

-- Passing grade dan batas percobaan harus sama untuk peserta awal dan akhir.
CREATE OR REPLACE FUNCTION private.guard_training_learning_rules_after_started()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.training_has_participant_activity(OLD.id) THEN
    IF NEW.passing_score IS DISTINCT FROM OLD.passing_score
       OR NEW.max_posttest_attempts IS DISTINCT FROM OLD.max_posttest_attempts THEN
      RAISE EXCEPTION 'Passing grade dan maksimal percobaan Post-Test tidak dapat diubah karena peserta sudah mulai mengikuti pelatihan';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_training_learning_rules_after_started ON public.trainings;
CREATE TRIGGER guard_training_learning_rules_after_started
BEFORE UPDATE ON public.trainings
FOR EACH ROW
EXECUTE FUNCTION private.guard_training_learning_rules_after_started();

REVOKE ALL ON FUNCTION private.guard_training_learning_rules_after_started()
FROM PUBLIC, anon, authenticated;

-- Draft -> Aktif wajib lolos checklist 9/9. Ini menjadi pengaman server-side,
-- sehingga publikasi tidak dapat dilewati walaupun UI gagal/diakali.
CREATE OR REPLACE FUNCTION private.guard_training_publication_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ready BOOLEAN := FALSE;
  v_completed INTEGER := 0;
  v_total INTEGER := 9;
BEGIN
  IF COALESCE(NEW.active, FALSE)
     AND NOT COALESCE(OLD.active, FALSE) THEN
    SELECT r.ready, r.completed_items, r.total_items
      INTO v_ready, v_completed, v_total
    FROM public.admin_training_readiness_list() r
    WHERE r.training_id = NEW.id;

    IF NOT COALESCE(v_ready, FALSE) THEN
      RAISE EXCEPTION 'Pelatihan belum dapat dipublikasikan. Checklist kesiapan harus lengkap (%/%). Selesaikan seluruh persiapan dan Mode Uji Coba Admin terlebih dahulu.', COALESCE(v_completed, 0), COALESCE(v_total, 9);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_training_publication_readiness ON public.trainings;
CREATE TRIGGER guard_training_publication_readiness
BEFORE UPDATE ON public.trainings
FOR EACH ROW
EXECUTE FUNCTION private.guard_training_publication_readiness();

REVOKE ALL ON FUNCTION private.guard_training_publication_readiness()
FROM PUBLIC, anon, authenticated;

-- UI dapat memakai RPC ini untuk menampilkan banner "Struktur Terkunci"
-- dan men-disable tombol edit sebelum admin mendapat error dari database.
CREATE OR REPLACE FUNCTION public.admin_training_lock_status_list()
RETURNS TABLE (
  training_id UUID,
  locked BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_lms_admin() THEN
    RAISE EXCEPTION 'Akses hanya untuk admin';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    private.training_has_participant_activity(t.id),
    CASE
      WHEN private.training_has_participant_activity(t.id)
        THEN 'Struktur pelatihan terkunci karena sudah terdapat aktivitas peserta.'
      ELSE 'Struktur pelatihan masih dapat diubah karena belum terdapat aktivitas peserta.'
    END
  FROM public.trainings t
  ORDER BY t.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_training_lock_status_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_training_lock_status_list() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
