import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@loadingio/loading-bar/dist/loading-bar.css';
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
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans dark:bg-slate-950 dark:text-slate-100">
        <PwaRegister />
        <Navbar>
          <div className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col">
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
              {children}
            </main>
            <Footer />
          </div>
        </Navbar>
      </body>
    </html>
  );
}
