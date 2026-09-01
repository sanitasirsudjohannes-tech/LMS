-- ============================================================
-- VISIBILITAS PELATIHAN & ARSIP SERTIFIKAT PESERTA
-- Jalankan satu kali di Supabase SQL Editor.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS trainings_select_authenticated ON public.trainings;
CREATE POLICY trainings_select_authenticated ON public.trainings
FOR SELECT TO authenticated
USING (
  active
  OR private.is_lms_admin()
  OR EXISTS (
    SELECT 1
    FROM public.certificates c
    WHERE c.training_id = trainings.id
      AND c.user_id = (SELECT auth.uid())
  )
);

COMMIT;

