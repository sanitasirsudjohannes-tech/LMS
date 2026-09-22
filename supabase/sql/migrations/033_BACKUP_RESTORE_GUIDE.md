# Backup terverifikasi dan pemulihan data operasional

## Penerapan

1. Pastikan migrasi sampai **032** sudah berhasil.
2. Jalankan seluruh `033_verified_backup_and_restore.sql` di SQL Editor Supabase. Migrasi dibungkus transaksi dan dapat dijalankan ulang.
3. Gunakan frontend dari commit perbaikan ini. Sebelum SQL 033 terpasang, backup lama akan ditolak oleh frontend dan endpoint baru belum tersedia. Sesudah SQL 033, frontend lama tidak dapat melakukan purge memakai ID saja.
4. Buat backup baru. ZIP versi 1 tetap dapat dibaca manual sebagai arsip, tetapi tidak diterima untuk purge/pemulihan otomatis.

Migrasi tidak menjalankan purge atau restore dan tidak menghapus data peserta. Menyimpan backup di browser tidak dapat dibuktikan dari peristiwa klik unduh; karena itu aplikasi meminta admin memilih kembali ZIP yang sudah tersimpan sebelum purge. Server memvalidasi checksum SHA-256 terhadap catatan ekspor, identitas database/pelatihan, serta kecocokan data dan pengaturan terkini. Tidak ada payload besar yang disalin ke tabel backup.

## Penggunaan

- Arsipkan pelatihan, klik **Backup**, dan tunggu ZIP selesai diunduh.
- Simpan ZIP di lokasi aman. ZIP memuat data peserta dan snapshot kunci jawaban.
- Klik **Bersihkan**, pilih ZIP tersebut, lalu ketik nama pelatihan untuk konfirmasi. Jika data/pengaturan berubah, buat backup baru.
- Setelah pembersihan berhasil, tombol **Pulihkan dari ZIP** tersedia. Pilih ZIP yang sama dengan yang digunakan untuk pembersihan dan konfirmasi.
- Pemulihan mengembalikan materi, soal, sesi/jawaban, hasil tes, dan progres secara atomik. Pelatihan tetap **Arsip/nonaktif**; akun, sertifikat, nomor sertifikat, review, dan pengaturan sertifikat yang dipertahankan saat purge tidak ditimpa.
- Data operasional yang sudah terisi, ID bentrok, akun yang sudah dihapus, perubahan pengaturan, dan backup yang tidak sesuai menyebabkan pemulihan dibatalkan seluruhnya. Tidak ada pemulihan parsial.

## Cakupan dan batas

Pemulihan ini khusus pelatihan asal dalam database yang sama yang dibersihkan melalui alur versi 2. Ini bukan pemulihan database Supabase yang hilang, migrasi lintas project, atau pemulihan hasil purge versi lama. Tetap perlukan backup terpisah database/Auth/Storage untuk bencana menyeluruh.

Aset publik Supabase Storage pada URL materi, tanda tangan, dan cap disertakan dengan pemetaan URL serta SHA-256 di `manifest.json`. Kegagalan mengambil aset membatalkan pembuatan ZIP. Purge tidak menghapus objek Storage; restore aplikasi menggunakan URL asal dan tidak mengunggah ulang aset. Jika objek Storage dihapus di luar aplikasi, pemulihan objek dilakukan terpisah dari berkas ZIP. Google Drive/YouTube dan tautan eksternal lain tetap referensi, bukan salinan konten.

Batas browser: ZIP 64 MiB, `backup.json` 20 MiB, aset individual 16 MiB, maksimal 100 aset, total JSON+aset 64 MiB. Ukuran keluaran dekompresi juga dibatasi. Backup yang lebih besar memerlukan backup database oleh pengelola. Data numerik dinormalisasi sebelum checksum server agar angka desimal tidak salah dianggap rusak setelah melewati JSON JavaScript.

Operasi maintenance mengambil lock tulis sementara pada tabel pembelajaran untuk mencegah perubahan bersamaan; pembacaan tetap tersedia. Lock menunggu maksimal 5 detik, kemudian operasi gagal aman dan dapat dicoba kembali pada waktu sepi.

## Validasi

`npm run test:backup` menjalankan seluruh migrasi 001–033 pada PostgreSQL lokal melalui PGlite dengan pengganti minimal schema Auth/Storage, termasuk trigger aplikasi asli. Pengujian mencakup readback ZIP, checksum rusak, penolakan versi lama, otorisasi peserta, backup kedaluwarsa, purge–restore, rollback saat foreign key gagal, serta aset hilang/rusak. `npm run test:monitoring` tetap dijalankan. Tes lokal tidak membuktikan migrasi sudah diterapkan di Supabase produksi.
