# SQL Database LMS

Folder ini menyimpan SQL yang digunakan untuk membangun dan memperbarui database LMS di Supabase.

## Penting

Database production sudah menjalankan seluruh SQL yang tersedia. File-file ini **tidak perlu dijalankan ulang** hanya karena aplikasi dideploy ulang.

Untuk project Supabase baru, gunakan urutan di bawah. Untuk database production yang sudah aktif, jalankan hanya migrasi baru yang memang belum pernah diterapkan.

## Struktur

### File dasar

1. `schema.sql` — struktur awal database LMS.
2. `seed_data.sql` — data awal/contoh. Gunakan hanya jika memang membutuhkan seed data.
3. `create_admin.sql` — bantuan pembuatan/penetapan akun admin awal.

### Migrasi

File pada folder `migrations/` adalah perubahan database setelah schema awal. Jalankan sesuai nomor urut:

1. `001_fix_profile_access.sql`
2. `002_security_hardening.sql`
3. `003_certificate_signature_storage.sql`
4. `004_certificate_training_dates.sql`
5. `005_training_jpl_and_attempt_limit.sql`
6. `006_training_visibility_and_certificate_archive.sql`
7. `007_admin_pagination_and_bandwidth.sql`
8. `008_bugfix_stability_2026_09.sql`

`008_bugfix_stability_2026_09.sql` adalah lapisan stabilitas terbaru dan memperbarui beberapa fungsi dari migrasi sebelumnya.

## Aturan ke depan

- Jangan menghapus migrasi yang sudah pernah dijalankan di production.
- Jangan mengubah isi migrasi lama setelah diterapkan. Buat migrasi baru untuk perubahan berikutnya.
- Beri nomor berurutan, misalnya `009_nama_perubahan.sql`.
- SQL perbaikan sementara yang sudah tidak digunakan jangan dijalankan kembali tanpa mengecek README dan riwayat migrasi.
- Setelah membuat RPC/function baru yang dipakai frontend, tambahkan `NOTIFY pgrst, 'reload schema';` bila diperlukan agar PostgREST memuat schema terbaru.

## Production saat ini

Seluruh SQL sampai `008_bugfix_stability_2026_09.sql` telah diterapkan. Dengan demikian, saat deployment frontend normal tidak ada SQL di folder ini yang perlu dijalankan kembali.
