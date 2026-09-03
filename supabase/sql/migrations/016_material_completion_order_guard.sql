-- Memperketat penyelesaian materi agar urutan tetap divalidasi di server.
-- Aman dijalankan ulang melalui Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_material_progress(p_material_id UUID)
RETURNS public.material_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_progress public.material_progress%ROWTYPE;
  v_material public.materials%ROWTYPE;
  v_previous UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'peserta'
  ) THEN
    RAISE EXCEPTION 'Akses hanya untuk peserta';
  END IF;

  SELECT m.* INTO v_material
  FROM public.materials m
  JOIN public.trainings t ON t.id = m.training_id
  WHERE m.id = p_material_id
    AND m.active
    AND t.active
    AND (t.start_date IS NULL OR t.start_date <= now())
    AND (t.end_date IS NULL OR t.end_date >= now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Materi tidak aktif atau di luar periode pelatihan';
  END IF;

  SELECT * INTO v_progress
  FROM public.material_progress
  WHERE user_id = auth.uid() AND material_id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Materi belum dimulai';
  END IF;

  -- Validasi ulang urutan pada saat penyelesaian. Ini mencegah bypass
  -- apabila sesi materi sudah pernah dibuat tetapi progres sebelumnya belum selesai.
  SELECT m.id INTO v_previous
  FROM public.materials m
  WHERE m.training_id = v_material.training_id
    AND m.active
    AND (
      m.order_number < v_material.order_number
      OR (m.order_number = v_material.order_number AND m.id < v_material.id)
    )
  ORDER BY m.order_number DESC, m.id DESC
  LIMIT 1;

  IF v_previous IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.material_progress mp
    WHERE mp.user_id = auth.uid()
      AND mp.material_id = v_previous
      AND mp.completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Selesaikan materi sebelumnya terlebih dahulu';
  END IF;

  IF v_progress.completed_at IS NULL
     AND now() < v_progress.started_at + make_interval(secs => GREATEST(v_material.minimum_duration_seconds, 0)) THEN
    RAISE EXCEPTION 'Durasi minimum materi belum terpenuhi';
  END IF;

  UPDATE public.material_progress
  SET completed_at = COALESCE(completed_at, now())
  WHERE id = v_progress.id
  RETURNING * INTO v_progress;

  RETURN v_progress;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_material_progress(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_material_progress(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
