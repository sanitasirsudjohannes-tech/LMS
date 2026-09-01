# LMS RSUD Prof. Dr. W.Z. Johannes Kupang

Learning Management System internal untuk pelatihan daring RSUD Prof. Dr. W.Z. Johannes Kupang. Aplikasi mendukung alur peserta dari pendaftaran hingga sertifikat digital dan menyediakan panel admin untuk mengelola seluruh pelatihan.

## Fitur utama

### Peserta

- Pendaftaran dan login menggunakan Supabase Authentication.
- Pre-Test satu kali sebelum materi dibuka.
- Materi wajib dipelajari secara berurutan dengan durasi minimum dari server.
- Post-Test maksimal lima kali dengan penilaian di database.
- Soal dan pilihan diacak secara konsisten untuk setiap sesi tes.
- Jawaban tersimpan otomatis di perangkat dan Supabase serta pulih setelah halaman dimuat ulang.
- Sertifikat digital, nomor otomatis opsional, QR verifikasi, PDF, dan arsip sertifikat.
- Tampilan responsif untuk HP dan komputer.

### Admin

- Kelola pelatihan, periode, JPL, materi, dan bank soal.
- Kelola format nomor dan tanda tangan sertifikat per pelatihan.
- Statistik peserta, progres, hasil tes, status kelulusan, dan ekspor CSV.
- Pagination dan filter di database untuk mengurangi pemakaian bandwidth.
- Verifikasi sertifikat publik menggunakan kode unik.

## Teknologi

- Next.js 16 dan React 19
- TypeScript dan Tailwind CSS 4
- Supabase Authentication, PostgreSQL, Storage, RLS, dan RPC
- Vercel untuk deployment

## Persyaratan

- Node.js 20 atau lebih baru
- Akun Supabase
- Akun Vercel untuk deployment produksi
- Repository GitHub ini

## 1. Instalasi aplikasi

```bash
git clone https://github.com/sanitasirsudjohannes-tech/LMS.git
cd LMS
npm ci
```

## 2. Instalasi database Supabase

1. Buat project Supabase.
2. Buka **SQL Editor**.
3. Jalankan seluruh berkas dalam `supabase/sql/migrations/` sesuai nomor `001` sampai `009`.
4. Buat akun admin dan tetapkan role menggunakan `supabase/sql/setup/create_admin.sql`.
5. Data contoh pada `supabase/sql/setup/seed_data.sql` bersifat opsional.

Panduan lengkap, urutan migrasi, pembaruan instalasi lama, dan pemecahan masalah tersedia di [`supabase/sql/README.md`](supabase/sql/README.md).

## 3. Pengaturan Supabase Authentication

Di **Authentication → URL Configuration**, isi:

- **Site URL**: URL produksi, misalnya `https://lmsrsudjohannes.vercel.app`
- **Redirect URL**: `https://lmsrsudjohannes.vercel.app/reset-password`

Alur pendaftaran aplikasi saat ini mengharapkan peserta langsung memiliki sesi setelah mendaftar. Di **Authentication → Providers → Email**, nonaktifkan kewajiban konfirmasi email. Untuk akun admin yang dibuat manual, gunakan pilihan **Auto confirm user**.

## 4. Environment variable

Buat `.env.local` untuk pengembangan lokal:

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ANON_KEY_PROJECT
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Gunakan anon key, bukan service role key. Jangan commit `.env.local` ke GitHub.

Tambahkan ketiga variabel yang sama di Vercel untuk environment **Production**, **Preview**, dan **Development**. Ubah `NEXT_PUBLIC_APP_URL` menjadi URL masing-masing deployment.

## 5. Menjalankan secara lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

Pemeriksaan sebelum commit atau deployment:

```bash
npm run lint
npm run build
npm audit --omit=dev
```

## 6. Deployment Vercel

1. Impor repository ini ke Vercel.
2. Pastikan framework terdeteksi sebagai **Next.js**.
3. Tambahkan seluruh environment variable.
4. Deploy aplikasi.
5. Uji pendaftaran peserta, Pre-Test, materi, Post-Test, sertifikat, login admin, dan verifikasi QR.

Jika environment variable diubah, lakukan **Redeploy**. Aplikasi sengaja berhenti saat build bila URL atau anon key Supabase belum tersedia agar tidak tersambung ke project yang salah.

## Memperbarui database yang sudah berjalan

Jalankan ulang tiga migrasi berikut secara berurutan:

1. `supabase/sql/migrations/002_security_hardening.sql`
2. `supabase/sql/migrations/007_admin_pagination_and_bandwidth.sql`
3. `supabase/sql/migrations/008_bugfix_stability_2026_09.sql`

Migrasi terbaru memperbaiki kontrol role peserta/admin, statistik peserta yang belum mulai, penerbitan ulang sertifikat, integritas nomor sertifikat dan urutan materi, serta konkurensi submit tes.

## Struktur penting repository

```text
src/app/                  Halaman peserta, admin, login, dan verifikasi
src/components/           Komponen antarmuka dan template sertifikat
src/lib/                  Integrasi Supabase, penyimpanan data, PDF, dan utilitas
supabase/sql/migrations/  Migrasi database wajib dan berurutan
supabase/sql/setup/       Pembuatan admin dan data contoh opsional
supabase/sql/maintenance/ Perbaikan khusus instalasi lama
```

## Pemecahan masalah singkat

### Fungsi RPC tidak ditemukan

Pastikan migrasi `007` dan `008` berhasil. Kemudian reload schema cache Supabase atau jalankan:

```sql
NOTIFY pgrst, 'reload schema';
```

### Profil pengguna tidak ditemukan

Pastikan migrasi keamanan berhasil. Untuk instalasi lama, jalankan `supabase/sql/maintenance/fix_profile_access.sql`.

### Build gagal karena konfigurasi Supabase

Pastikan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` tersedia pada environment yang sedang dibangun.

## Keamanan

- Kunci jawaban tidak dikirim ke browser peserta.
- Nilai tes dihitung oleh RPC database.
- Penulisan progres dan sertifikat dilakukan melalui fungsi server.
- RLS membatasi data peserta ke pemiliknya dan fungsi admin memeriksa role di database.
- Service role key tidak digunakan di frontend.
