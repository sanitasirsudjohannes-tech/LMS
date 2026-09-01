-- ============================================================
-- SQL SEED DATA: Pelatihan, Materi, Pre-Test, Post-Test, & Pengaturan Sertifikat
-- Jalankan di SQL Editor Supabase Anda
-- ============================================================

-- 1. Insert Data Pelatihan Utama
INSERT INTO public.trainings (id, title, description, start_date, end_date, passing_score, max_posttest_attempts, active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Pelatihan Standar Pelayanan & Keselamatan Kerja',
  'Pelatihan wajib untuk seluruh staf dalam meningkatkan mutu pelayanan dan penerapan SPO keselamatan.',
  '2026-08-01T00:00:00.000Z',
  '2026-12-31T23:59:59.000Z',
  80,
  3,
  true
)
ON CONFLICT (id) DO UPDATE SET 
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  active = true;

-- 2. Insert Data Materi Pelatihan (Materi 1, 2, 3)
INSERT INTO public.materials (id, training_id, title, description, content, content_url, minimum_duration_seconds, order_number, active)
VALUES 
(
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'Materi 1: Pengenalan & Orientasi Pelatihan',
  'Memahami visi, misi, serta alur pendaftaran hingga penerbitan sertifikat pelatihan online.',
  'Selamat Datang di LMS Pelatihan Online!

Pelatihan ini dirancang untuk memfasilitasi peningkatan kompetensi secara fleksibel melalui HP maupun Komputer.

Prinsip Utama:
1. Selesaikan Pre-Test terlebih dahulu sebelum membuka materi.
2. Pelajari materi secara berurutan sesuai alur.
3. Perhatikan durasi minimum membaca/menonton setiap materi.
4. Ikuti Post-Test setelah seluruh materi selesai dipelajari.
5. Unduh sertifikat digital yang dilengkapi QR Code dan Nomor Verifikasi Resmi.',
  '',
  10,
  1,
  true
),
(
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  'Materi 2: Standar Prosedur Operasional (SPO) Keselamatan',
  'Pedoman pelaksanaan SPO keselamatan dan pencegahan risiko kerja.',
  'Standard Operating Procedure (SPO) Keselamatan Kerja:

1. Identifikasi Potensi Bahaya di Area Kerja.
2. Penggunaan Alat Pelindung Diri (APD) yang sesuai.
3. Pelaporan Insiden Kejadian Nyaris Cedera (KNC) dan Kejadian Tidak Diharapkan (KTD).
4. Penanganan Keadaan Darurat dan Jalur Evakuasi.

Pastikan Anda membaca dan memahami poin-poin keselamatan di atas sebelum melanjutkan ke materi berikutnya.',
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
  15,
  2,
  true
),
(
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000001',
  'Materi 3: Etika Komunikasi dan Pelayanan Prima',
  'Prinsip komunikasi efektif dan peningkatan kepuasan peserta/pengguna.',
  'Etika Komunikasi dan Pelayanan Prima:

- Terapkan 5S (Senyum, Salam, Sapa, Sopan, Santun).
- Mendengarkan secara aktif (Active Listening).
- Menyampaikan informasi secara jelas, tepat, dan empati.
- Menjaga kerahasiaan data dan hak-hak privasi.

Dengan menyelesaikan materi 3, Anda berhak melanjutkan ke sesi Post-Test.',
  '',
  10,
  3,
  true
)
ON CONFLICT (id) DO UPDATE SET 
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  order_number = EXCLUDED.order_number;

-- 3. Insert Bank Soal Pre-Test
INSERT INTO public.questions (id, training_id, test_type, question, option_a, option_b, option_c, option_d, correct_answer, active)
VALUES 
(
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  'pretest',
  'Apa tujuan utama dari penerapan Standard Operating Procedure (SPO) keselamatan?',
  'Menambah beban administrasi',
  'Mencegah terjadinya kecelakaan kerja dan menjamin keselamatan',
  'Hanya untuk syarat formalitas audit',
  'Mengurangi waktu istirahat pekerja',
  'B',
  true
),
(
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000001',
  'pretest',
  'Berikut ini yang termasuk dalam prinsip 5S pelayanan adalah...',
  'Senyum, Salam, Sapa, Sopan, Santun',
  'Santai, Serius, Sigap, Semangat, Sukses',
  'Satu, Sehat, Sejahtera, Selamat, Sentosa',
  'Singkat, Padat, Jelas, Cepat, Tepat',
  'A',
  true
),
(
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000001',
  'pretest',
  'Apakah nilai Pre-test menentukan kelulusan peserta?',
  'Ya, pre-test adalah penentu utama kelulusan',
  'Tidak, pre-test hanya untuk mengukur pemahaman awal sebelum materi',
  'Ya, jika nilai pre-test di bawah 50 peserta langsung gugur',
  'Tergantung persetujuan admin',
  'B',
  true
)
ON CONFLICT (id) DO UPDATE SET question = EXCLUDED.question;

-- 4. Insert Bank Soal Post-Test
INSERT INTO public.questions (id, training_id, test_type, question, option_a, option_b, option_c, option_d, correct_answer, active)
VALUES 
(
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000001',
  'posttest',
  'Langkah pertama dalam penanganan bahaya keselamatan di area kerja adalah...',
  'Mengabaikan bahaya jika belum ada korban',
  'Melakukan identifikasi potensi bahaya di tempat kerja',
  'Langsung pulang ke rumah',
  'Menunggu laporan dari pihak luar',
  'B',
  true
),
(
  '00000000-0000-0000-0000-000000000205',
  '00000000-0000-0000-0000-000000000001',
  'posttest',
  'Berapakah passing grade (nilai kelulusan minimal) standar untuk pelatihan ini?',
  '50',
  '60',
  '80',
  '100',
  'C',
  true
),
(
  '00000000-0000-0000-0000-000000000206',
  '00000000-0000-0000-0000-000000000001',
  'posttest',
  'Bagaimana cara melakukan verifikasi keaslian sertifikat yang diterbitkan LMS?',
  'Menghubungi kantor pusat lewat telepon',
  'Memindai QR Code atau membuka tautan /verify/[kode_verifikasi]',
  'Mencetak ulang sertifikat di percetakan',
  'Mengirimkan surat fisik',
  'B',
  true
)
ON CONFLICT (id) DO UPDATE SET question = EXCLUDED.question;

-- 5. Insert Pengaturan Sertifikat
INSERT INTO public.certificate_settings (
  id, training_id, certificate_enabled, numbering_enabled, number_format, start_number, number_digits, current_number, show_posttest_score, signatory_name, signatory_title
)
VALUES (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000001',
  true,
  true,
  '{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}',
  1,
  4,
  1,
  true,
  'Dr. Johanes, Sp.A',
  'Direktur Pelatihan'
)
ON CONFLICT (training_id) DO NOTHING;

-- Verifikasi Data
SELECT count(*) AS total_materials FROM public.materials;
SELECT test_type, count(*) AS total_questions FROM public.questions GROUP BY test_type;
