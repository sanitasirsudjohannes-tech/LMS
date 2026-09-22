# Proses rilis LONTAR

## Urutan aman

1. Kerjakan perubahan pada branch terpisah dan buka pull request ke `main`.
2. Pastikan pemeriksaan **Quality** di GitHub lulus. Pemeriksaan menjalankan validasi
   urutan migrasi, TypeScript, ESLint, tes monitoring/backup, dan build produksi.
3. Jika ada SQL baru, buat backup Supabase dan jalankan migrasi sesuai
   `supabase/sql/migrations/order.txt`. Catat nomor terakhir yang berhasil.
4. Gabungkan perubahan ke `main`. Vercel akan melakukan deployment produksi.
5. Pastikan status deployment GitHub/Vercel berhasil, lalu lakukan smoke test:
   login peserta, login admin, daftar pelatihan, Pre-Test, materi, Post-Test,
   review, sertifikat, QR verifikasi, dan fitur yang diubah.
6. Jika frontend memerlukan migrasi baru, jangan menganggap rilis selesai sebelum
   SQL dan smoke test produksi keduanya berhasil.

## Urutan perubahan database dan frontend

- Perubahan SQL yang kompatibel dengan frontend lama: jalankan SQL lebih dahulu,
  kemudian gabungkan frontend.
- Perubahan yang menutup endpoint lama, seperti migrasi 033: SQL dan frontend
  harus diterapkan dalam jendela rilis yang sama. Selama transisi, operasi yang
  berisiko harus gagal aman.
- Jangan menjalankan ulang arsip 001-017 pada database produksi.
- Jangan menentukan urutan berdasarkan nama file saja. Nomor 022 memiliki dua
  file historis dan keduanya wajib dijalankan dalam urutan di `order.txt`.

## Rollback

- Frontend: redeploy commit produksi terakhir yang sehat melalui Vercel.
- Database: jangan membatalkan migrasi dengan menghapus tabel/fungsi secara
  manual. Gunakan backup dan SQL rollback yang ditinjau khusus untuk migrasi itu.
- Jika SQL sudah diterapkan tetapi frontend gagal, pertahankan database dan
  perbaiki/redeploy frontend kecuali ada prosedur rollback SQL yang teruji.

## Catatan rilis minimum

Simpan tanggal WITA, commit SHA, nomor migrasi terakhir, hasil Quality, status
Vercel, pelaksana SQL, dan hasil smoke test. Jangan menyimpan secret atau anon key
di catatan rilis.
