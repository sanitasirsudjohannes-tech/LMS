-- 021_training_review_integrity.sql
-- Integritas review pelatihan: hanya peserta yang lulus dapat mengirim review,
-- review wajib sebelum sertifikat baru diterbitkan, dan sertifikat lama tetap sah.

BEGIN;

-- Pastikan tabel tersedia bila 020 belum sempat dijalankan.
CREATE TABLE IF NOT EXISTS public.training_reviews (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  material_rating smallint not null check (material_rating between 1 and 5),
  material_ease_rating smallint not null check (material_ease_rating between 1 and 5),
  relevance_rating smallint not null check (relevance_rating between 1 and 5),
  speaker_rating smallint not null check (speaker_rating between 1 and 5),
  suggestion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_id, user_id)
);

ALTER TABLE public.training_reviews ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS training_reviews_training_id_idx
ON public.training_reviews(training_id);

-- Hanya peserta yang benar-benar lulus Post-Test yang boleh membuat/mengubah review miliknya.
DROP POLICY IF EXISTS "participants insert own training reviews" ON public.training_reviews;
CREATE POLICY "participants insert own training reviews"
ON public.training_reviews FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.trainings t
    WHERE t.id = training_id
      AND EXISTS (
        SELECT 1
        FROM public.test_attempts a
        WHERE a.user_id = auth.uid()
          AND a.training_id = training_id
          AND a.test_type = 'posttest'
          AND a.score >= t.passing_score
      )
  )
);

DROP POLICY IF EXISTS "participants update own training reviews" ON public.training_reviews;
CREATE POLICY "participants update own training reviews"
ON public.training_reviews FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.trainings t
    WHERE t.id = training_id
      AND EXISTS (
        SELECT 1
        FROM public.test_attempts a
        WHERE a.user_id = auth.uid()
          AND a.training_id = training_id
          AND a.test_type = 'posttest'
          AND a.score >= t.passing_score
      )
  )
);

-- Gunakan helper admin yang sudah di-hardening agar kebijakan konsisten dan tidak memicu recursive RLS.
DROP POLICY IF EXISTS "admin read all training reviews" ON public.training_reviews;
CREATE POLICY "admin read all training reviews"
ON public.training_reviews FOR SELECT
TO authenticated
USING (private.is_lms_admin(auth.uid()));

-- Pertahankan kemampuan peserta membaca review miliknya sendiri.
DROP POLICY IF EXISTS "participants read own training reviews" ON public.training_reviews;
CREATE POLICY "participants read own training reviews"
ON public.training_reviews FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Tambahkan review sebagai syarat server-side kelayakan sertifikat baru.
-- Sertifikat yang sudah terbit tidak terpengaruh karena issue_lms_certificate
-- selalu mengembalikan TRUE lebih dahulu bila sertifikat existing ditemukan.
CREATE OR REPLACE FUNCTION private.lms_certificate_eligible_score(
  p_user_id UUID,
  p_training_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_passing_score NUMERIC;
  v_best_score NUMERIC;
BEGIN
  IF p_user_id IS NULL OR p_training_id IS NULL THEN
    RAISE EXCEPTION 'Peserta dan pelatihan wajib tersedia';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.role = 'peserta'
  ) THEN
    RAISE EXCEPTION 'Profil peserta tidak ditemukan';
  END IF;

  SELECT t.passing_score INTO v_passing_score
  FROM public.trainings t
  WHERE t.id = p_training_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pelatihan tidak ditemukan';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.test_attempts a
    WHERE a.user_id = p_user_id
      AND a.training_id = p_training_id
      AND a.test_type = 'pretest'
  ) THEN
    RAISE EXCEPTION 'Peserta belum menyelesaikan Pre-Test';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.materials m
    WHERE m.training_id = p_training_id
      AND m.active
      AND NOT EXISTS (
        SELECT 1 FROM public.material_progress mp
        WHERE mp.user_id = p_user_id
          AND mp.material_id = m.id
          AND mp.completed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Peserta belum menyelesaikan seluruh materi';
  END IF;

  SELECT MAX(a.score) INTO v_best_score
  FROM public.test_attempts a
  WHERE a.user_id = p_user_id
    AND a.training_id = p_training_id
    AND a.test_type = 'posttest';

  IF v_best_score IS NULL THEN
    RAISE EXCEPTION 'Peserta belum menyelesaikan Post-Test';
  END IF;

  IF v_best_score < v_passing_score THEN
    RAISE EXCEPTION 'Peserta belum lulus Post-Test';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.training_reviews r
    WHERE r.user_id = p_user_id
      AND r.training_id = p_training_id
  ) THEN
    RAISE EXCEPTION 'Review pelatihan wajib diisi sebelum sertifikat diterbitkan';
  END IF;

  RETURN v_best_score;
END;
$$;

REVOKE ALL ON FUNCTION private.lms_certificate_eligible_score(UUID, UUID)
FROM PUBLIC, anon, authenticated;

-- Setelah review berhasil disimpan, coba terbitkan sertifikat secara otomatis.
-- Jika pengaturan sertifikat belum aktif, fungsi hanya mengembalikan FALSE dan review tetap tersimpan.
CREATE OR REPLACE FUNCTION private.issue_certificate_after_training_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_score NUMERIC;
BEGIN
  SELECT MAX(a.score) INTO v_score
  FROM public.test_attempts a
  WHERE a.user_id = NEW.user_id
    AND a.training_id = NEW.training_id
    AND a.test_type = 'posttest';

  PERFORM private.issue_lms_certificate(NEW.user_id, NEW.training_id, v_score);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS issue_certificate_after_training_review ON public.training_reviews;
CREATE TRIGGER issue_certificate_after_training_review
AFTER INSERT OR UPDATE ON public.training_reviews
FOR EACH ROW
EXECUTE FUNCTION private.issue_certificate_after_training_review();

COMMIT;
