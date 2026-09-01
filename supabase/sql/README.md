# SQL Database LMS

Folder ini adalah dokumentasi database LMS di Supabase.

> **STATUS PRODUCTION:** seluruh file SQL yang saat ini ada di folder ini sudah pernah dijalankan. Jangan menjalankannya kembali hanya karena melakukan deploy frontend.

## Mana yang perlu dipakai?

### 1. Instalasi database baru

Gunakan `schema.sql` sebagai struktur dasar. `seed_data.sql` hanya digunakan bila memang membutuhkan data awal/contoh. `create_admin.sql` digunakan untuk penyiapan admin awal bila diperlukan.

### 2. Database production yang sekarang

**Tidak ada SQL lama yang perlu dijalankan lagi.** File yang ada dipertahankan sebagai riwayat perubahan dan referensi database.

### 3. Perubahan database berikutnya

Mulai perubahan berikutnya di folder `migrations/` dengan nomor mulai dari `009`, misalnya:

`migrations/009_nama_perubahan.sql`

Dengan cara ini, file lama tidak bercampur dengan SQL yang benar-benar masih perlu dijalankan.

## Riwayat SQL yang sudah diterapkan

Urutan historisnya:

1. `schema.sql` — struktur dasar LMS.
2. `security_hardening.sql` — RLS, keamanan role, RPC tes/progres/sertifikat.
3. `fix_profile_access.sql` — kompatibilitas akses profil akun lama.
4. `certificate_signature_storage.sql` — penyimpanan tanda tangan sertifikat.
5. `certificate_training_dates.sql` — tanggal pelatihan pada sertifikat.
6. `training_jpl_and_attempt_limit.sql` — JPL dan batas percobaan Post-Test.
7. `training_visibility_and_certificate_archive.sql` — visibilitas pelatihan/arsip sertifikat.
8. `admin_pagination_and_bandwidth.sql` — optimasi panel admin dan RPC pagination.
9. `bugfix_stability_2026_09.sql` — lapisan stabilitas terbaru; memperbarui beberapa RPC/fungsi dari SQL sebelumnya.

`seed_data.sql` dan `create_admin.sql` adalah utility/setup, bukan migrasi rutin.

## Aturan mulai sekarang

- Jangan menghapus SQL yang sudah pernah diterapkan di production.
- Jangan mengedit migrasi lama untuk perubahan database baru.
- Setiap perubahan database baru dibuat sebagai file baru di `migrations/`.
- Gunakan nomor berurutan: `009_...`, `010_...`, `011_...`, dan seterusnya.
- Satu file sebaiknya mewakili satu perubahan yang jelas.
- Jika RPC/function yang dipakai frontend berubah, pastikan schema PostgREST dimuat ulang bila diperlukan.
- Setelah migrasi baru berhasil diterapkan ke production, catat statusnya di README ini.

## Ringkas

**Untuk penggunaan LMS saat ini: jangan jalankan file SQL lama lagi.** Tunggu sampai ada file baru di `migrations/` yang secara eksplisit disebut perlu dijalankan.
