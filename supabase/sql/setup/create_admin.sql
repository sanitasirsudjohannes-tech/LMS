-- ============================================================
-- BUAT AKUN ADMIN DI SUPABASE
-- Jalankan SQL ini di Supabase SQL Editor (satu per satu)
-- ============================================================

-- ============================================================
-- BUAT USER MELALUI SUPABASE DASHBOARD
-- ============================================================
-- 1. Buka: Authentication → Users → "Add user" (tombol kanan atas)
-- 2. Isi:
--      Email    : email admin Anda
--      Password : gunakan password unik yang kuat (jangan simpan di repository)
--      (centang "Auto confirm user")
-- 3. Klik "Create user"
-- 4. Ganti email pada SQL di bawah, lalu jalankan blok INSERT dan verifikasi.

-- Membuat/memperbarui profil admin berdasarkan user Auth yang sudah ada.
-- WAJIB ganti teks GANTI_DENGAN_EMAIL_ADMIN sebelum menjalankan.
INSERT INTO public.profiles (id, full_name, email, institution, role)
SELECT
  u.id,
  'Administrator LMS',
  COALESCE(u.email, ''),
  'RSUD Prof. Dr. W. Z. Johannes',
  'admin'
FROM auth.users u
WHERE lower(u.email) = lower('GANTI_DENGAN_EMAIL_ADMIN')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = 'admin';

-- ============================================================
-- VERIFIKASI: Pastikan admin sudah masuk ke tabel profiles
-- ============================================================
SELECT id, full_name, email, role
FROM public.profiles
WHERE role = 'admin'
ORDER BY created_at;
