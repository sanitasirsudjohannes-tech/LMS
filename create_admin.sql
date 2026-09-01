-- ============================================================
-- BUAT AKUN ADMIN DI SUPABASE
-- Jalankan SQL ini di Supabase SQL Editor (satu per satu)
-- ============================================================

-- LANGKAH 1: Buat user admin di auth.users via Supabase Auth Admin API
-- Jalankan ini di SQL Editor Supabase:
SELECT extensions.pgcrypto_version(); -- test agar extension aktif

-- LANGKAH 2: Insert user admin ke auth.users langsung
-- Ganti password_hash dengan password pilihan Anda menggunakan bcrypt
-- Atau gunakan cara di bawah yang lebih mudah (Langkah 3)

-- ============================================================
-- CARA TERMUDAH: Gunakan Supabase Dashboard
-- ============================================================
-- 1. Buka: Authentication → Users → "Add user" (tombol kanan atas)
-- 2. Isi:
--      Email    : admin@lms.id
--      Password : Admin1234!
--      (centang "Auto confirm user")
-- 3. Klik "Create user"
-- 4. Salin UUID user yang baru dibuat
-- 5. Jalankan SQL di bawah ini, ganti <UUID_DARI_LANGKAH_4>

-- LANGKAH 3: Insert profil admin ke tabel profiles
-- Ganti nilai UUID di bawah dengan UUID dari langkah 4
INSERT INTO public.profiles (id, full_name, email, institution, role)
VALUES (
  '2feff67d-a696-47bb-b5c9-e19faba096dc',   -- ← ganti dengan UUID asli
  'Administrator LMS',
  'admin@lms.id',
  'RSUD Prof. Dr. W. Z. Johannes',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ============================================================
-- VERIFIKASI: Pastikan admin sudah masuk ke tabel profiles
-- ============================================================
SELECT id, full_name, email, role FROM public.profiles WHERE role = 'admin';
