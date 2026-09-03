# SQL LONTAR

Struktur SQL setelah perapihan baseline 2026-09-03.

- `migrations/` hanya untuk perubahan baru setelah baseline. Nomor berikutnya: **018**.
- `archive/pre_baseline_017/` menyimpan riwayat migrasi 001-017 yang sudah diterapkan pada database produksi.
- Database produksi **tidak perlu menjalankan ulang** migrasi 001-017.

Catatan penting: produksi sempat menjalankan dua file dengan nomor 016. File pengamanan urutan materi tetap dicatat sebagai 016, sedangkan migrasi integritas sertifikat dinomori ulang menjadi 017 di repository. Isi perbaikan sertifikat sudah diterapkan pada database produksi, sehingga 017 tidak perlu dijalankan ulang di produksi.

Untuk instalasi Supabase baru, gunakan bundle arsip 001-017 secara berurutan sampai tersedia schema dump/squash terverifikasi dari database. Jangan membuat baseline tunggal dengan sekadar copy-paste karena beberapa fungsi, trigger, policy, dan grant ditimpa oleh migrasi berikutnya.
