-- ============================================================
-- STORAGE TANDA TANGAN DIREKTUR
-- Jalankan satu kali di Supabase SQL Editor.
-- ============================================================

BEGIN;

ALTER TABLE public.certificate_settings
  ADD COLUMN IF NOT EXISTS signatory_image_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('certificate-assets', 'certificate-assets', TRUE, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS certificate_assets_public_read ON storage.objects;
CREATE POLICY certificate_assets_public_read ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'certificate-assets');

DROP POLICY IF EXISTS certificate_assets_admin_insert ON storage.objects;
CREATE POLICY certificate_assets_admin_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'certificate-assets' AND private.is_lms_admin());

DROP POLICY IF EXISTS certificate_assets_admin_update ON storage.objects;
CREATE POLICY certificate_assets_admin_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'certificate-assets' AND private.is_lms_admin())
WITH CHECK (bucket_id = 'certificate-assets' AND private.is_lms_admin());

DROP POLICY IF EXISTS certificate_assets_admin_delete ON storage.objects;
CREATE POLICY certificate_assets_admin_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'certificate-assets' AND private.is_lms_admin());

COMMIT;
