# LMS RSUD Prof. Dr. W.Z. Johannes Kupang

Learning Management System internal milik RSUD Prof. Dr. W.Z. Johannes Kupang.

## Setup Supabase

Urutan instalasi database wajib:

1. Jalankan `schema.sql` di Supabase SQL Editor.
2. Jalankan `security_hardening.sql` segera sesudahnya.
3. Jalankan `training_jpl_and_attempt_limit.sql` untuk mengaktifkan JPL dan batas Post-Test 5 kali.
4. Buat akun admin melalui Supabase Authentication, lalu ikuti `create_admin.sql` untuk menetapkan perannya.

`security_hardening.sql` memasang Row Level Security berbasis kepemilikan/admin, menyembunyikan kunci jawaban dari peserta, menilai tes di server, memvalidasi timer materi di server, dan menerbitkan sertifikat secara atomik. Jangan deploy frontend baru sebelum migrasi ini berhasil.

## Menjalankan aplikasi

Untuk deployment produksi, tambahkan environment variable berikut di Vercel:

```env
NEXT_PUBLIC_APP_URL=https://lmsrsudjohannes.vercel.app
```

Di Supabase Authentication → URL Configuration, gunakan Site URL
`https://lmsrsudjohannes.vercel.app` dan tambahkan Redirect URL
`https://lmsrsudjohannes.vercel.app/reset-password`.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# LMS
