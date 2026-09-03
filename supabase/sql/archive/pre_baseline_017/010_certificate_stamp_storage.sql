-- ============================================================
-- CAP DIREKTUR PADA SERTIFIKAT
-- Jalankan satu kali di Supabase SQL Editor setelah migrasi 005.
-- ============================================================

BEGIN;

ALTER TABLE public.certificate_settings
  ADD COLUMN IF NOT EXISTS stamp_image_url TEXT;

-- Pastikan bucket lama juga menerima aset cap PNG dengan batas yang sama.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certificate-assets', 'certificate-assets', TRUE, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
