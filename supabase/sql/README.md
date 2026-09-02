# Panduan SQL LMS

Semua berkas database disusun berdasarkan tujuan agar urutan instalasi tidak tertukar.

## Struktur folder

| Folder | Kegunaan | Kapan dijalankan |
| --- | --- | --- |
| `migrations/` | Struktur tabel, keamanan, RPC, indeks, dan perbaikan skema | Wajib, sesuai nomor urut |
| `setup/` | Membuat admin dan data contoh | Setelah seluruh migrasi |
| `maintenance/` | Perbaikan khusus untuk instalasi lama | Hanya jika mengalami masalah terkait |

## Instalasi database baru

Jalankan berkas di Supabase **SQL Editor** satu per satu dan tunggu status berhasil sebelum melanjutkan:

1. `migrations/001_schema.sql`
2. `migrations/002_security_hardening.sql`
3. `migrations/003_training_jpl_and_attempt_limit.sql`
4. `migrations/004_certificate_training_dates.sql`
5. `migrations/005_certificate_signature_storage.sql`
6. `migrations/006_training_visibility_and_certificate_archive.sql`
7. `migrations/007_admin_pagination_and_bandwidth.sql`
8. `migrations/008_bugfix_stability_2026_09.sql`
9. `migrations/009_test_sessions_autosave_shuffle.sql`
10. `migrations/010_certificate_stamp_storage.sql`
11. `migrations/011_long_term_archive_and_certificate_snapshot.sql`
12. `migrations/012_training_retention_backup_and_monitoring.sql`

Setelah itu:

1. Buat user admin melalui **Authentication → Users → Add user** dan aktifkan **Auto confirm user**.
2. Buka `setup/create_admin.sql`, ganti `GANTI_DENGAN_EMAIL_ADMIN`, kemudian jalankan bagian `INSERT` dan verifikasinya.
3. `setup/seed_data.sql` bersifat opsional. Jangan jalankan pada database produksi yang sudah berisi pelatihan nyata kecuali memang ingin memasukkan data contoh.

## Memperbarui instalasi lama

Untuk aplikasi yang sebelumnya sudah terpasang, jalankan ulang secara berurutan:

1. `migrations/002_security_hardening.sql`
2. `migrations/007_admin_pagination_and_bandwidth.sql`
3. `migrations/008_bugfix_stability_2026_09.sql`
4. `migrations/009_test_sessions_autosave_shuffle.sql`
5. `migrations/010_certificate_stamp_storage.sql`
6. `migrations/011_long_term_archive_and_certificate_snapshot.sql`
7. `migrations/012_training_retention_backup_and_monitoring.sql`

Migrasi 011 wajib dijalankan sebelum memakai status **Arsip**. Migrasi ini
menyalin data penting ke setiap sertifikat dan mengubah foreign key agar
sertifikat tidak terhapus ketika akun atau pelatihan induknya dihapus.

Migrasi 012 menambahkan backup per pelatihan, statistik permanen, perlindungan
hapus, pembersihan data operasional setelah backup, dan indikator ukuran
database. Pelatihan produksi disimpan sebagai log; hanya Draf tanpa aktivitas
peserta yang dapat dihapus permanen.

Keempat berkas tersebut menggunakan transaksi dan dirancang aman dijalankan ulang. Jika migrasi berhenti karena nomor sertifikat atau urutan materi duplikat, rapikan data duplikat yang disebutkan dalam pesan kesalahan sebelum mencoba lagi. Jangan menghapus data secara massal hanya untuk melewati validasi.

## Pemeliharaan

`maintenance/fix_profile_access.sql` hanya diperlukan bila user dapat masuk melalui Supabase Auth tetapi aplikasi menampilkan pesan bahwa profil tidak ditemukan. Migrasi keamanan terbaru sudah memuat konfigurasi normal yang dibutuhkan, sehingga berkas ini bukan bagian instalasi rutin.

## Catatan keamanan

- Jangan menyimpan password, service role key, atau token Supabase dalam repository.
- Frontend hanya menggunakan anon key melalui `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Jangan melewati `002_security_hardening.sql`; berkas ini memasang RLS, kontrol role, penilaian tes di server, timer materi, dan penerbitan sertifikat atomik.
- Jangan mengubah nomor urut sertifikat ke angka yang lebih rendah setelah sertifikat diterbitkan.
- Setelah perubahan RPC, bila Supabase masih menyatakan fungsi tidak ditemukan, buka **Settings → API** lalu reload schema cache, atau jalankan `NOTIFY pgrst, 'reload schema';`.
