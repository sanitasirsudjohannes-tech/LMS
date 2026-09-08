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
