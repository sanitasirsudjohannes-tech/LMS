import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'LONTAR - LMS Online & Pelatihan Terpadu RSUD Johannes',
  description: 'LMS Online & Pelatihan Terpadu RSUD Prof. Dr. W. Z. Johannes Kupang untuk materi, evaluasi, dan sertifikat digital.',
  applicationName: 'LONTAR',
  icons: { icon: '/lontar-logo.jpg', apple: '/lontar-logo.jpg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full">
      <body className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans">
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
