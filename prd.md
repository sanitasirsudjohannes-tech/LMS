# Product Requirements Document (PRD)
## LMS Pelatihan Online

**Versi:** 1.0  
**Platform:** Web Application / PWA  
**Frontend:** Next.js + TypeScript + Tailwind CSS  
**Backend:** Supabase  
**Deployment:** Vercel  
**Target awal:** ±1.000 peserta per kegiatan

---

github : https://github.com/sanitasirsudjohannes-tech/LMS.git
bikin gitignore kecualikan .env
.env dijalankan dilokal saja

anon key : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkeGl3dHdlenRycmxxaGZnbWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNzc3ODAsImV4cCI6MjEwMzc1Mzc4MH0.u-f2ajaQ4uCpLfxuS4HN-L5FkbpJRYguTqRLmkOpEII

supabase url : https://xdxiwtweztrrlqhfgmhl.supabase.co



## 1. Ringkasan Produk

LMS Pelatihan Online adalah aplikasi web sederhana untuk menyelenggarakan pelatihan secara daring dengan alur utama:

**Pendaftaran → Login → Pre-test → Materi berurutan → Post-test → Kelulusan → Sertifikat**

Aplikasi difokuskan pada kemudahan penggunaan melalui HP, administrasi sederhana, biaya operasional rendah, dan kemampuan menangani sekitar 1.000 peserta dalam satu kegiatan.

Sistem tidak ditujukan untuk meniru seluruh fitur Moodle. Versi awal hanya menyediakan fitur yang diperlukan untuk pelaksanaan pelatihan.

---

## 2. Tujuan

1. Memfasilitasi pendaftaran peserta secara online.
2. Menyediakan akun individual peserta.
3. Menyelenggarakan pre-test dan post-test.
4. Menampilkan materi secara berurutan.
5. Menerapkan durasi minimum pada setiap materi.
6. Mencegah peserta melewati tahapan yang belum diselesaikan.
7. Menghitung nilai secara otomatis.
8. Menentukan kelulusan secara otomatis.
9. Menghasilkan sertifikat PDF secara otomatis.
10. Memberikan opsi nomor sertifikat yang dapat dikonfigurasi admin.
11. Menyediakan verifikasi sertifikat melalui QR Code/kode verifikasi.
12. Memudahkan admin memantau progres dan hasil peserta.

---

## 3. Role Pengguna

### 3.1 Admin

Admin dapat:

- Login ke dashboard admin.
- Membuat dan mengatur pelatihan.
- Mengaktifkan/nonaktifkan pelatihan.
- Mengelola peserta.
- Mengelola materi.
- Mengatur urutan dan durasi minimum materi.
- Mengelola soal pre-test dan post-test.
- Menentukan nilai kelulusan.
- Menentukan jumlah kesempatan post-test.
- Mengelola pengaturan sertifikat.
- Menentukan apakah sertifikat menggunakan nomor.
- Menentukan format nomor sertifikat.
- Melihat progres peserta.
- Melihat nilai peserta.
- Melihat status kelulusan.
- Mengunduh laporan peserta.
- Melihat dan mengunduh sertifikat peserta.

### 3.2 Peserta

Peserta dapat:

- Mendaftar.
- Login/logout.
- Reset password.
- Melihat dashboard pelatihan.
- Mengerjakan pre-test.
- Membuka materi sesuai urutan.
- Menyelesaikan waktu minimum setiap materi.
- Mengerjakan post-test.
- Melihat nilai dan status kelulusan.
- Mengunduh sertifikat jika memenuhi syarat.

---

## 4. Alur Peserta

```text
Pendaftaran
    ↓
Login
    ↓
Pre-test
    ↓
Materi 1
    ↓
Materi 2
    ↓
Materi 3
    ↓
Materi berikutnya
    ↓
Post-test
    ↓
Lulus
    ↓
Sertifikat
```

Tahapan yang belum memenuhi persyaratan ditampilkan dalam keadaan terkunci.

Contoh:

```text
✓ Pre-test
✓ Materi 1
● Materi 2
🔒 Materi 3
🔒 Post-test
🔒 Sertifikat
```

---

## 5. Pendaftaran Peserta

Form pendaftaran minimal berisi:

- Nama lengkap
- Email
- Instansi/unit kerja
- Password
- Konfirmasi password

Field opsional:

- NIP/NIK
- Nomor HP

Ketentuan:

- Email harus unik.
- Satu email hanya dapat memiliki satu akun.
- Password dikelola melalui Supabase Auth.
- Setelah registrasi berhasil, peserta diarahkan ke login atau otomatis login sesuai konfigurasi aplikasi.

---

## 6. Autentikasi

Metode utama:

**Email + Password**

Fitur:

- Login
- Logout
- Lupa/reset password
- Session persistence
- Proteksi halaman berdasarkan role

Supabase Auth digunakan sebagai sistem autentikasi.

---

## 7. Dashboard Peserta

Dashboard harus sederhana dan mobile-first.

Menampilkan:

- Nama peserta
- Nama pelatihan
- Periode pelatihan
- Status pelatihan
- Persentase progres
- Tahapan pelatihan
- Tombol aksi utama berdasarkan progres

Contoh:

```text
Progress Pelatihan
████████░░ 80%

✓ Pre-test
✓ Materi 1
✓ Materi 2
● Materi 3
🔒 Post-test
🔒 Sertifikat
```

Peserta cukup mendapatkan satu tombol utama seperti:

- Mulai Pre-test
- Lanjut Materi
- Mulai Post-test
- Unduh Sertifikat

---

## 8. Pre-test

Pre-test wajib diselesaikan sebelum materi pertama dibuka.

### Jenis soal versi awal

- Pilihan ganda

Setiap soal memiliki:

- Pertanyaan
- Pilihan A
- Pilihan B
- Pilihan C
- Pilihan D
- Jawaban benar

Nilai dihitung otomatis:

```text
Nilai = (Jumlah Jawaban Benar / Jumlah Soal) × 100
```

Nilai pre-test tidak menentukan kelulusan.

Setelah pre-test berhasil dikirim, Materi 1 terbuka.

---

## 9. Materi Pelatihan

Materi dapat berupa:

- Teks
- PDF
- Gambar
- Video/link video

Admin menentukan:

- Judul
- Deskripsi
- Konten/link
- Urutan
- Durasi minimum
- Status aktif/nonaktif

Video berukuran besar disarankan menggunakan layanan eksternal seperti YouTube Unlisted agar tidak membebani storage/egress aplikasi.

---

## 10. Timer Materi

Setiap materi dapat memiliki durasi minimum.

Contoh:

```text
Materi 1
Durasi minimum: 15 menit
```

Saat peserta pertama kali membuka materi, server/database mencatat:

```text
started_at
```

Timer pada browser menampilkan sisa waktu, tetapi bukan sumber validasi utama.

Sebelum durasi terpenuhi:

```text
Lanjut 🔒
```

Setelah durasi terpenuhi:

```text
Selesaikan Materi ✓
```

Saat peserta menyelesaikan materi, sistem memvalidasi selisih waktu server terhadap `started_at`. Jika valid, sistem mencatat:

```text
completed_at
```

### Prinsip performa

Timer **tidak** mengirim update ke Supabase setiap detik.

Idealnya hanya:

1. Satu operasi saat materi dimulai.
2. Satu operasi saat materi diselesaikan.

---

## 11. Penguncian Materi

Materi harus diselesaikan sesuai urutan.

Contoh:

```text
Materi 1 selesai → Materi 2 terbuka
Materi 2 selesai → Materi 3 terbuka
Semua materi selesai → Post-test terbuka
```

Peserta tidak boleh melewati penguncian hanya dengan mengganti URL.

Validasi akses dilakukan pada server/database, bukan hanya frontend.

---

## 12. Post-test

Post-test hanya tersedia setelah seluruh materi selesai.

Jenis soal versi awal:

- Pilihan ganda

Admin dapat menentukan:

- Soal
- Jawaban benar
- Nilai minimal kelulusan
- Jumlah kesempatan post-test

Contoh:

```text
Passing grade: 80
Maksimal percobaan: 2
```

Jika:

```text
Nilai >= 80 → LULUS
Nilai < 80  → BELUM LULUS
```

Setiap percobaan dicatat.

---

## 13. Sertifikat

Sertifikat hanya tersedia apabila peserta:

- Menyelesaikan pre-test.
- Menyelesaikan seluruh materi.
- Menyelesaikan post-test.
- Memenuhi nilai kelulusan.

Sertifikat dibuat dalam format PDF.

Informasi minimal:

- Nama peserta
- Nama pelatihan
- Tanggal/periode pelatihan
- Nomor sertifikat jika diaktifkan
- QR Code/kode verifikasi
- Nama dan jabatan penandatangan

Nilai post-test dapat ditampilkan atau disembunyikan sesuai konfigurasi.

---

## 14. Pengaturan Nomor Sertifikat

Admin dapat menentukan apakah sertifikat menggunakan nomor.

### 14.1 Toggle nomor sertifikat

```text
Gunakan nomor sertifikat?
[ Ya / Tidak ]
```

Jika **Tidak**, sertifikat dibuat tanpa nomor.

Jika **Ya**, pengaturan format nomor ditampilkan.

### 14.2 Format ditentukan admin

Admin dapat menulis format menggunakan placeholder.

Placeholder versi awal:

- `{NO}` — nomor urut otomatis
- `{TAHUN}` — tahun 4 digit
- `{TAHUN2}` — tahun 2 digit
- `{BULAN}` — bulan numerik
- `{BULAN_ROMAWI}` — bulan dalam angka Romawi

Admin juga dapat memasukkan teks dan separator bebas.

Contoh format:

```text
{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}
```

Dengan:

```text
Nomor awal: 1
Jumlah digit: 4
```

Hasil:

```text
0001/SERT/MFK/VIII/2026
0002/SERT/MFK/VIII/2026
0003/SERT/MFK/VIII/2026
```

Contoh lain:

```text
SERT-{TAHUN}-{NO}
```

Hasil:

```text
SERT-2026-0001
```

### 14.3 Pengaturan tambahan

Admin dapat menentukan:

- Nomor awal
- Jumlah digit nomor
- Format nomor
- Apakah penomoran aktif

UI harus menampilkan preview sebelum disimpan.

Contoh:

```text
Format:
{NO}/DIKLAT/{TAHUN}

Nomor awal:
1

Digit:
4

Preview:
0001/DIKLAT/2026
```

### 14.4 Aturan nomor

- Nomor sertifikat yang sudah diterbitkan tidak boleh berubah otomatis ketika format diubah.
- Nomor disimpan sebagai nilai final pada record sertifikat.
- Nomor yang sudah diterbitkan harus unik dalam ruang lingkup yang ditentukan sistem.
- Penomoran dilakukan secara aman di server/database untuk mencegah dua peserta memperoleh nomor yang sama saat menyelesaikan pelatihan secara bersamaan.
- Admin tidak perlu mengetahui ID internal database.

---

## 15. Verifikasi Sertifikat

Setiap sertifikat memiliki `verification_code` unik, terlepas dari penggunaan nomor sertifikat.

QR Code mengarah ke halaman publik seperti:

```text
/verify/[verification_code]
```

Halaman verifikasi menampilkan minimal:

```text
SERTIFIKAT VALID ✓

Nama: [Nama Peserta]
Pelatihan: [Nama Pelatihan]
Tanggal: [Tanggal]
Nomor: [Nomor Sertifikat, jika ada]
```

Informasi pribadi yang tidak diperlukan tidak ditampilkan.

---

## 16. Dashboard Admin

Dashboard admin menampilkan statistik ringkas:

- Total peserta
- Sudah pre-test
- Sedang mengikuti materi
- Selesai seluruh materi
- Sudah post-test
- Lulus
- Belum lulus
- Sertifikat diterbitkan

Contoh:

```text
1.000 Peserta
  950 Pre-test
  820 Selesai Materi
  780 Post-test
  750 Lulus
  750 Sertifikat
```

Grafik kompleks tidak diperlukan pada versi awal.

---

## 17. Kelola Peserta

Admin dapat melihat daftar peserta dengan informasi:

- Nama
- Email
- Unit/instansi
- Progress
- Nilai pre-test
- Nilai post-test
- Status kelulusan
- Nomor sertifikat jika ada
- Status sertifikat

Fitur:

- Search nama/email
- Pagination
- Filter status
- Export CSV/Excel

Filter minimal:

- Semua
- Belum mulai
- Sedang mengikuti
- Selesai materi
- Lulus
- Belum lulus

---

## 18. Kelola Materi

Admin dapat:

- Tambah
- Edit
- Hapus
- Aktif/nonaktifkan
- Mengubah urutan
- Mengatur durasi minimum

Field minimal:

- Judul
- Deskripsi
- Konten
- Content URL
- Durasi minimum
- Urutan

---

## 19. Kelola Soal

Admin dapat mengelola soal untuk:

- Pre-test
- Post-test

Field:

- Pertanyaan
- Pilihan A
- Pilihan B
- Pilihan C
- Pilihan D
- Jawaban benar
- Status aktif

Essay tidak diperlukan pada versi pertama.

---

## 20. Laporan

Admin dapat mengekspor laporan minimal berisi:

- Nama peserta
- Email
- Instansi/unit
- Nilai pre-test
- Nilai post-test
- Status kelulusan
- Progres
- Waktu penyelesaian
- Nomor sertifikat jika digunakan
- Tanggal sertifikat

Format minimal:

- CSV

Excel dapat ditambahkan bila diperlukan.

---

## 21. Struktur Database Awal

### `profiles`

- `id`
- `full_name`
- `email`
- `institution`
- `nip_nik` nullable
- `phone` nullable
- `role`
- `created_at`

### `trainings`

- `id`
- `title`
- `description`
- `start_date`
- `end_date`
- `passing_score`
- `max_posttest_attempts`
- `active`
- `created_at`

### `materials`

- `id`
- `training_id`
- `title`
- `description`
- `content`
- `content_url`
- `minimum_duration_seconds`
- `order_number`
- `active`

### `questions`

- `id`
- `training_id`
- `test_type`
- `question`
- `option_a`
- `option_b`
- `option_c`
- `option_d`
- `correct_answer`
- `active`

### `test_attempts`

- `id`
- `user_id`
- `training_id`
- `test_type`
- `score`
- `attempt_number`
- `started_at`
- `submitted_at`

### `material_progress`

- `id`
- `user_id`
- `material_id`
- `started_at`
- `completed_at`

### `certificate_settings`

- `id`
- `training_id`
- `certificate_enabled`
- `numbering_enabled`
- `number_format`
- `start_number`
- `number_digits`
- `current_number`
- `show_posttest_score`
- `signatory_name`
- `signatory_title`
- `updated_at`

Contoh `number_format`:

```text
{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}
```

### `certificates`

- `id`
- `user_id`
- `training_id`
- `certificate_number` nullable
- `verification_code`
- `issued_at`
- `posttest_score`

`certificate_number` nullable karena admin dapat menonaktifkan nomor sertifikat.

---

## 22. Keamanan

Supabase Row Level Security (RLS) wajib diaktifkan.

Peserta hanya boleh:

- Membaca profil sendiri.
- Membaca progres sendiri.
- Membaca hasil tes sendiri.
- Membaca sertifikat sendiri.
- Mengakses materi yang diizinkan.

Peserta tidak boleh:

- Melihat data peserta lain.
- Membaca jawaban benar sebelum penilaian.
- Mengubah nilai.
- Mengubah status kelulusan.
- Memanipulasi `started_at`/`completed_at`.
- Membuat sertifikat sendiri.
- Menentukan nomor sertifikat sendiri.

Operasi sensitif dilakukan melalui server-side logic, Supabase RPC/database function, atau endpoint server yang tervalidasi.

---

## 23. Arsitektur Teknis

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Mobile-first responsive design

### Backend

Supabase:

- PostgreSQL
- Auth
- Row Level Security
- RPC/database functions bila diperlukan

### Deployment

- Vercel

### Media

- PDF/gambar: storage sesuai kebutuhan
- Video besar: layanan eksternal seperti YouTube Unlisted

---

## 24. Optimasi ±1.000 Peserta

Prinsip utama:

- Jangan update timer ke database setiap detik.
- Gunakan pagination pada daftar peserta.
- Jangan mengambil seluruh data peserta pada dashboard.
- Gunakan query agregasi untuk statistik.
- Jawaban tes dikirim sekaligus ketika submit.
- Validasi nilai dilakukan server-side.
- Nomor sertifikat diterbitkan secara atomic untuk menghindari duplikasi.
- Hindari realtime subscription jika tidak diperlukan.
- Hindari polling berlebihan.

---

## 25. Mobile First dan PWA

Aplikasi diprioritaskan untuk penggunaan melalui HP.

Harus nyaman digunakan pada:

- Android
- iPhone
- Tablet
- Desktop/laptop

Tidak boleh ada scroll horizontal pada halaman utama.

Aplikasi dapat dikonfigurasi sebagai PWA sehingga peserta dapat menambahkannya ke home screen.

Mode offline **tidak diperlukan** pada versi pertama.

---

## 26. Struktur Halaman

### Publik

```text
/
/register
/login
/forgot-password
/verify/[code]
```

### Peserta

```text
/dashboard
/pretest
/material/[id]
/posttest
/certificate
```

### Admin

```text
/admin
/admin/participants
/admin/materials
/admin/questions
/admin/results
/admin/certificates
/admin/certificate-settings
/admin/training-settings
```

---

## 27. Fitur yang Tidak Masuk Versi 1

Untuk menjaga aplikasi sederhana, versi pertama tidak mencakup:

- Forum
- Chat
- Video conference
- Live streaming
- Pembayaran
- Marketplace course
- Badge
- Gamification
- Ranking
- Social login
- AI
- Multi-language
- Multi-tenant/multi-organisasi kompleks
- Aplikasi Android/iOS native
- Mode offline
- Essay/manual grading

Fitur dapat ditambahkan kemudian berdasarkan kebutuhan nyata.

---

## 28. Acceptance Criteria

Versi pertama dinyatakan siap apabila:

1. ±1.000 peserta dapat memiliki akun.
2. Peserta dapat mendaftar dan login.
3. Role admin dan peserta terproteksi dengan benar.
4. Pre-test dapat dikerjakan dan dinilai otomatis.
5. Materi terbuka sesuai urutan.
6. Durasi minimum materi tervalidasi.
7. Peserta tidak dapat melewati materi melalui manipulasi URL/frontend.
8. Post-test hanya terbuka setelah seluruh materi selesai.
9. Nilai post-test dihitung otomatis.
10. Kelulusan ditentukan berdasarkan passing grade.
11. Sertifikat hanya tersedia bagi peserta yang memenuhi syarat.
12. Admin dapat mengaktifkan atau menonaktifkan nomor sertifikat.
13. Admin dapat menentukan format nomor sertifikat menggunakan placeholder.
14. Preview nomor sertifikat sesuai format admin.
15. Nomor sertifikat tidak duplikat saat banyak peserta lulus bersamaan.
16. Sertifikat dapat diverifikasi menggunakan QR/kode verifikasi.
17. Admin dapat melihat progres dan hasil peserta.
18. Data peserta/hasil dapat diekspor.
19. UI nyaman digunakan melalui HP.
20. RLS mencegah peserta mengakses data peserta lain.

---

## 29. Tahapan Pengembangan

### Fase 1 — Fondasi

- Next.js project
- Supabase project
- Database schema
- Authentication
- RLS
- Role admin/peserta

### Fase 2 — Peserta

- Register
- Login
- Reset password
- Dashboard
- Progress

### Fase 3 — Pelatihan

- Pre-test
- Materi
- Timer
- Sequential locking
- Post-test
- Kelulusan

### Fase 4 — Sertifikat

- Certificate settings
- Toggle nomor sertifikat
- Format builder
- Auto-numbering
- PDF
- QR Code
- Verification page

### Fase 5 — Admin

- Dashboard
- Peserta
- Materi
- Soal
- Hasil
- Sertifikat
- Export

### Fase 6 — Pengujian

- Registrasi/login
- RLS
- Timer
- Manipulasi URL
- Manipulasi client-side state
- Pre-test/post-test
- Multiple attempts
- Kelulusan
- Concurrent certificate issuance
- PDF/QR
- Mobile responsiveness
- Simulasi beban pengguna

---

## 30. Prinsip Produk

LMS harus:

**Sederhana untuk peserta**  
**Mudah dikelola admin**  
**Mobile-first**  
**Aman di sisi database**  
**Efisien untuk ±1.000 peserta**  
**Biaya operasional serendah mungkin**

Fokus utama versi pertama adalah memastikan alur berikut berjalan stabil:

> **Daftar → Pre-test → Belajar → Post-test → Lulus → Sertifikat**
