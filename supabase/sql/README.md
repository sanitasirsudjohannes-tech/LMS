# SQL LONTAR

Struktur SQL setelah perapihan baseline 2026-09-03.

- `migrations/` hanya untuk perubahan baru setelah baseline. Nomor berikutnya: **018**.
- `archive/pre_baseline_017/` menyimpan riwayat migrasi 001-017 yang sudah diterapkan pada database produksi.
- Database produksi **tidak perlu menjalankan ulang** migrasi 001-017.

Catatan penting: produksi sempat menjalankan dua file dengan nomor 016. File pengamanan urutan materi tetap dicatat sebagai 016, sedangkan migrasi integritas sertifikat dinomori ulang menjadi 017 di repository. Isi perbaikan sertifikat sudah diterapkan pada database produksi, sehingga 017 tidak perlu dijalankan ulang di produksi.

Untuk instalasi Supabase baru, gunakan bundle arsip 001-017 secara berurutan sampai tersedia schema dump/squash terverifikasi dari database. Jangan membuat baseline tunggal dengan sekadar copy-paste karena beberapa fungsi, trigger, policy, dan grant ditimpa oleh migrasi berikutnya.

## Upgrade uji coba dan publikasi (030)

Pastikan 026, 027, 028, dan 029 sudah berhasil dijalankan, kemudian jalankan
`supabase/sql/migrations/030_preview_duration_and_publication_guard.sql` di SQL Editor Supabase.
Jangan menjalankan ulang baseline atau migrasi lama yang sudah selesai.

- Admin dapat melewati timer uji coba setelah menyetujui durasi asli setiap materi.
- Checklist menjadi 10 poin, termasuk peninjauan durasi seluruh materi.
- Uji coba lama yang belum mencatat persetujuan durasi perlu diulang sebelum publikasi berikutnya.
- Simpan perubahan pengaturan sebagai draf, selesaikan uji coba, lalu aktifkan pelatihan.
- Pelatihan yang sudah aktif tetap aktif; timer dan progres peserta tidak berubah.
- Materi, soal, durasi dan aturan kelulusan tetap dikunci setelah ada aktivitas peserta.
- Sesi uji coba kedaluwarsa harus dimulai ulang. Penulisan sesi hanya melalui RPC admin.

Validasi perubahan: build produksi dan TypeScript berhasil; migrasi diuji pada PostgreSQL
via PGlite dengan skema fixture (bukan database produksi): migrasi dapat diulang,
INSERT aktif ditolak, persetujuan durasi diwajibkan, penyelesaian parsial ditolak,
publikasi siap diterima, perubahan versi bersamaan publikasi ditolak, sesi kedaluwarsa
ditolak, dan hak tulis langsung dicabut. Lint repo masih memiliki error lama di luar
perubahan ini. Uji alur admin dengan akun nyata setelah menjalankan SQL.
