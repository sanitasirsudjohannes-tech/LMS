-- Penguatan integritas penerbitan, arsip, snapshot, dan zona waktu sertifikat.
-- Jalankan setelah migrasi 016_material_completion_order_guard.sql.
-- Catatan: bila versi sebelumnya bernama 016_certificate_issuance_integrity.sql sudah pernah dijalankan,
-- file ini tidak perlu dijalankan ulang; perubahan ini hanya merapikan urutan nama migrasi di repository.

-- Isi migrasi ini identik dengan 016_certificate_issuance_integrity.sql yang telah diterapkan sebelumnya.
-- File dipertahankan sebagai penanda urutan migrasi 017 untuk instalasi baru.
\i 016_certificate_issuance_integrity.sql
