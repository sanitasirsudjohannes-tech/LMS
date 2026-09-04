'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { UserProfile } from '@/types';
import CertificateAdminTabs from '@/components/CertificateAdminTabs';
import { Building2 } from 'lucide-react';

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
  if (loading || !currentUser) return <div className="flex min-h-[50vh] w-full items-center justify-center"><LontarLoadingSpinner size="lg" text="Memuat Dashboard Admin..." /></div>;

  const isCertificatePath = pathname.startsWith('/admin/certificates') || pathname.startsWith('/admin/certificate-settings') || pathname.startsWith('/admin/certificate-general') || pathname.startsWith('/admin/certificate-training');

  return (
    <div className="space-y-6 py-2">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 p-4">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-[#07375c] text-white flex items-center justify-center shadow-sm">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-400 block">
              PANEL PENGELOLA • LONTAR
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-tight">
              Admin LONTAR RSUD Prof. Dr. W.Z. Johannes Kupang
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sistem Manajemen Pelatihan Terpadu & Penerbitan Sertifikat Digital
            </p>
          </div>
        </div>
      </div>

      {isCertificatePath && !pathname.startsWith('/admin/certificate-settings') && <CertificateAdminTabs />}
      <main className="w-full">{children}</main>
    </div>
  );
}
