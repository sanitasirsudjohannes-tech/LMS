# Active migrations

Folder ini hanya untuk migrasi baru setelah baseline produksi yang sudah mencakup perubahan sampai 017.

Migrasi produksi aktif saat ini:

- `018_purge_certificate_guard.sql` — pengamanan purge data operasional pelatihan arsip.
- `019_certificate_eligibility_integrity.sql` — memastikan sertifikat hanya diterbitkan setelah Pre-Test, seluruh materi aktif, dan Post-Test lulus; aturan yang sama dipakai saat recovery sertifikat dan purge arsip.
- `020_training_reviews.sql` — menambahkan penyimpanan review pelatihan setelah Post-Test.
- `021_training_review_integrity.sql` — memperketat RLS review, mewajibkan review sebelum sertifikat baru diterbitkan, menerbitkan sertifikat otomatis setelah review, dan tetap mempertahankan sertifikat lama yang sudah terbit.
- `022_learning_flow_integrity.sql` — snapshot soal per sesi tes, scoring berdasarkan snapshot, menghapus penerbitan sertifikat sebelum review, dan mengunci struktur materi setelah peserta mulai pelatihan.
- `023_question_structure_freeze.sql` — membekukan bank soal setelah ada aktivitas peserta agar soal tidak berubah di tengah pengerjaan.
- `024_test_session_snapshot_security.sql` — mencegah kunci jawaban snapshot terkirim ke browser, memperbaiki autosave parsial, dan tetap mewajibkan semua soal saat submit.
- `025_learning_structure_guard_hardening.sql` — menutup bypass pemindahan soal/materi antar pelatihan setelah ada aktivitas peserta.

Jalankan migrasi secara berurutan. Jangan menjalankan ulang 001-017 pada database produksi saat ini.

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

## Upgrade monitoring dan analitik (031)

Urutan untuk database yang sudah menjalankan 029:

1. Jalankan `030_preview_duration_and_publication_guard.sql` jika belum dijalankan.
2. Jalankan `031_learning_monitoring_and_analytics.sql`.

Jika pernah menjalankan **030_learning_monitoring_and_analytics.sql** dari branch
`upgrade/lms-recommended-features`, tetap jalankan 031. File 031 menggantikan RPC
analitik lama tanpa menghapus data. File analitik 030 lama sudah tidak digunakan;
030 yang dipertahankan adalah pengamanan uji coba/publikasi. Jangan menghapus
fungsi atau tabel secara manual dan jangan mengulang baseline.

Definisi laporan:

- **Mulai:** akun yang memiliki sesi tes, hasil tes, progres materi, review, atau sertifikat pada pelatihan.
- **Selesai:** sudah pretest, seluruh materi aktif selesai, posttest lulus dan review tersimpan; sertifikat yang sudah terbit tetap menjadi bukti selesai.
- **Kelulusan:** peserta lulus dibagi peserta yang sudah mengirim Post-Test.
- **Peningkatan:** rata-rata selisih Post-Test terbaik dan Pre-Test untuk peserta yang memiliki kedua nilai. Jumlah pasangan ditampilkan; tanpa pasangan ditampilkan tanda kosong.
- **Analisis soal:** seluruh percobaan Post-Test yang telah dikirim, bukan draft; seorang peserta dapat menyumbang lebih dari satu percobaan.
- **Aktivitas terakhir:** waktu sesi tes, hasil tes, mulai/selesai materi, review, atau penerbitan sertifikat.

Daftar pelatihan peserta memakai RPC `my_training_overview()` yang hanya mengirim
metadata dan ringkasan akun sendiri. Konten materi dimuat saat pelatihan dibuka.
Peringatan tenggat memakai pergantian tanggal WITA, bukan pembulatan durasi 24 jam.

Validasi lokal: `npm run test:monitoring` (PostgreSQL via PGlite dan utilitas WITA/CSV),
build produksi, TypeScript, dan ESLint untuk file yang diubah. Tes menggunakan skema
fixture; belum menjalankan migrasi atau uji akun pada Supabase produksi.
