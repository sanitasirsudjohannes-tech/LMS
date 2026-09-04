# Active migrations

Folder ini hanya untuk migrasi baru setelah baseline produksi yang sudah mencakup perubahan sampai 017.

Migrasi produksi aktif saat ini:

- `018_purge_certificate_guard.sql` — pengamanan purge data operasional pelatihan arsip.
- `019_certificate_eligibility_integrity.sql` — memastikan sertifikat hanya diterbitkan setelah Pre-Test, seluruh materi aktif, dan Post-Test lulus; aturan yang sama dipakai saat recovery sertifikat dan purge arsip.
- `020_training_reviews.sql` — menambahkan penyimpanan review pelatihan setelah Post-Test.
- `021_training_review_integrity.sql` — memperketat RLS review, mewajibkan review sebelum sertifikat baru diterbitkan, menerbitkan sertifikat otomatis setelah review, dan tetap mempertahankan sertifikat lama yang sudah terbit.

Jalankan migrasi secara berurutan. Jangan menjalankan ulang 001-017 pada database produksi saat ini.
