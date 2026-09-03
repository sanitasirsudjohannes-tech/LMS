# Arsip migrasi 001-017

Folder ini adalah riwayat SQL sebelum baseline produksi 2026-09-03.

Database produksi sudah menerima seluruh perubahan sampai integritas sertifikat. Karena itu file di sini **bukan daftar SQL yang perlu dijalankan ulang** pada produksi.

Penomoran akhir yang dipakai di repository:
- 016 = `016_material_completion_order_guard.sql`
- 017 = `017_certificate_issuance_integrity.sql`

Secara historis, migrasi sertifikat sempat dijalankan ketika masih bernomor 016. Penomoran di repository dirapikan menjadi 017 agar tidak bentrok, tanpa mengubah kondisi database yang sudah diterapkan.
