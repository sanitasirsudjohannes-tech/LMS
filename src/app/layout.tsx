import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PwaRegister from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: 'LONTAR - LMS Online & Pelatihan Terpadu RSUD Prof. Dr. W.Z. Johannes Kupang',
  description: 'LMS Online & Pelatihan Terpadu RSUD Prof. Dr. W.Z. Johannes Kupang untuk materi, evaluasi, dan sertifikat digital.',
  applicationName: 'LONTAR',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'LONTAR',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07375c',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full">
      <body className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans">
        <PwaRegister />
        <Navbar />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
