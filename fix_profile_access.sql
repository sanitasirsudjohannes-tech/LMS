-- ============================================================
-- PERBAIKAN AKSES PROFIL SETELAH SECURITY HARDENING
-- Jalankan satu kali di Supabase SQL Editor.
-- ============================================================

BEGIN;

-- Policy RLS memanggil helper ini. Schema private tetap tidak diekspos melalui
-- Data API Supabase, tetapi role authenticated harus dapat mengevaluasinya.
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_lms_admin(UUID) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_lms_admin(UUID) TO authenticated;

-- Pulihkan profil akun lama yang dibuat sebelum trigger otomatis tersedia.
INSERT INTO public.profiles (id, full_name, email, institution, role)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), split_part(COALESCE(u.email, ''), '@', 1), 'Peserta LMS'),
  COALESCE(u.email, ''),
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'institution', ''), 'Belum diisi'),
  'peserta'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Pemeriksaan: seluruh akun Auth seharusnya memiliki profil.
SELECT u.id, u.email, p.role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at;
