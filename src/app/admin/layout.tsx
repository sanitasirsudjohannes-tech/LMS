'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { UserProfile } from '@/types';
import CertificateAdminTabs from '@/components/CertificateAdminTabs';

const RECENT_LOGIN_KEY = 'lms_recent_login_at';
const RECENT_LOGIN_WINDOW_MS = 10_000;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const cachedUser = StorageAPI.getCurrentUser();
        const recentLoginAt = Number(sessionStorage.getItem(RECENT_LOGIN_KEY) || 0);
        const isRecentLogin = recentLoginAt > 0 && Date.now() - recentLoginAt < RECENT_LOGIN_WINDOW_MS;

        if (cachedUser && isRecentLogin) {
          if (cachedUser.role !== 'admin') {
            router.replace('/dashboard');
            return;
          }
          setCurrentUser(cachedUser);
          sessionStorage.removeItem(RECENT_LOGIN_KEY);
          return;
        }

        await initLocalStorage();
        const user = StorageAPI.getCurrentUser();
        if (!user) { router.replace('/login'); return; }
        if (user.role !== 'admin') { router.replace('/dashboard'); return; }
        setCurrentUser(user);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Dashboard admin gagal dimuat.');
      } finally { setLoading(false); }
    };
    void load();
  }, [router]);

  if (loadError) return <div className="max-w-md mx-auto py-12 text-center space-y-4"><p className="text-sm text-red-700 dark:text-red-300">{loadError}</p><button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold">Coba Lagi</button></div>;
  if (loading || !currentUser) return <div className="max-w-md mx-auto py-12 text-center text-slate-500 text-sm">Memuat Dashboard Admin...</div>;

  const isCertificatePath = pathname.startsWith('/admin/certificates') || pathname.startsWith('/admin/certificate-settings') || pathname.startsWith('/admin/certificate-general') || pathname.startsWith('/admin/certificate-training');

  return (
    <div className="space-y-6 py-2">
      <div className="bg-gradient-to-r from-teal-800 via-emerald-800 to-slate-900 dark:from-slate-900 dark:to-slate-900 text-white rounded-2xl p-6 shadow-md border border-teal-700/30 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><span className="text-xs font-semibold text-teal-300 dark:text-amber-400 uppercase tracking-wider block">Panel Pengelola</span><h1 className="text-xl sm:text-2xl font-bold">Admin LONTAR</h1><p className="text-xs text-teal-100/80 dark:text-slate-300 mt-0.5">LMS Online & Pelatihan Terpadu RSUD Prof. Dr. W.Z. Johannes Kupang</p></div>
      </div>

      {isCertificatePath && !pathname.startsWith('/admin/certificate-settings') && <CertificateAdminTabs />}
      <main className="w-full">{children}</main>
    </div>
  );
}
