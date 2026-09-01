# Migrasi Database Baru

Folder ini khusus untuk perubahan database **setelah kondisi production September 2026**.

Migrasi berikutnya dimulai dari:

- `009_nama_perubahan.sql`
- `010_nama_perubahan.sql`
- dan seterusnya.

Jangan memindahkan atau menyalin SQL lama ke sini hanya untuk dijalankan ulang. SQL lama pada parent folder sudah diterapkan dan dipertahankan sebagai riwayat.

Setelah sebuah migrasi berhasil dijalankan di production, perbarui `../README.md` agar status database tetap jelas.
