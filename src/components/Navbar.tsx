'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Award,
  BookOpen,
  Clock3,
  FileCheck2,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  Sliders,
  User,
  Users,
  X,
} from 'lucide-react';
import { logoutFromLontar } from '@/lib/logout';
import { getValidatedCurrentUser, clearValidatedUser } from '@/lib/authSession';
import { supabase } from '@/lib/supabase';
import { UserProfile } from '@/types';
import LontarLogo from '@/components/LontarLogo';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  certificateGroup?: boolean;
};

export default function Navbar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (isLoggingOut) return;
      setAuthLoading(true);
      try {
        const user = await getValidatedCurrentUser();
        if (mounted) setCurrentUser(user);
      } catch (error) {
        console.error('Gagal memulihkan sesi di navigasi:', error);
        // Error jaringan bukan bukti logout. Jangan menghapus user yang masih
        // tampil; otorisasi data tetap dijaga oleh RLS Supabase.
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
  }, [pathname, isLoggingOut]);

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        clearValidatedUser();
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        window.setTimeout(() => {
          void getValidatedCurrentUser(true)
            .then((user) => { if (active) setCurrentUser(user); })
            .catch((error) => console.error('Sinkronisasi sesi LONTAR gagal:', error));
        }, 0);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setIsMobileMenuOpen(false);

    try {
      await logoutFromLontar();
    } catch (error) {
      console.error('Logout Supabase gagal:', error);
    } finally {
      setCurrentUser(null);
      setAuthLoading(false);
      setIsLoggingOut(false);
      router.replace('/login');
    }
  };

  const navItems = useMemo<NavItem[]>(() => {
    if (!currentUser) return [];

    if (currentUser.role === 'admin') {
      return [
        { href: '/admin', label: 'Ringkasan', icon: LayoutDashboard, exact: true },
        { href: '/admin/participants', label: 'Peserta', icon: Users },
        { href: '/admin/materials', label: 'Materi', icon: BookOpen },
        { href: '/admin/questions', label: 'Soal Tes', icon: HelpCircle },
        { href: '/admin/results', label: 'Hasil Tes', icon: FileCheck2 },
        { href: '/admin/reviews', label: 'Review', icon: MessageSquareText },
        { href: '/admin/certificates', label: 'Sertifikat', icon: Award, certificateGroup: true },
        { href: '/admin/posttest-settings', label: 'Jadwal Post-Test', icon: Clock3 },
        { href: '/admin/training-settings', label: 'Kelola Pelatihan', icon: Sliders },
      ];
    }

    return [
      { href: '/dashboard', label: 'Dashboard Saya', icon: LayoutDashboard, exact: true },
      { href: '/certificates', label: 'Arsip Sertifikat', icon: Award },
    ];
  }, [currentUser]);

  const isActive = (item: NavItem) => {
    if (item.certificateGroup) {
      return pathname.startsWith('/admin/certificates')
        || pathname.startsWith('/admin/certificate-settings')
        || pathname.startsWith('/admin/certificate-general')
        || pathname.startsWith('/admin/certificate-training');
    }
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  if (isLoggingOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <Loader2 className="h-5 w-5 animate-spin text-[#07375c] dark:text-sky-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Keluar dari akun…</p>
            <p className="mt-1 text-xs text-slate-500">Mengakhiri sesi LONTAR dengan aman</p>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return <div className="min-h-screen">{children}</div>;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen">
        <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <LontarLogo priority className="shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" />
              <div className="min-w-0">
                <span className="block text-sm font-bold tracking-[0.12em] text-[#07375c] dark:text-sky-300">LONTAR</span>
                <span className="hidden truncate text-[10px] font-medium text-slate-500 sm:block">LMS Online & Pelatihan Terpadu RSUD Johannes</span>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {pathname !== '/login' && (
                <Link href="/login" className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900 sm:text-sm">
                  Masuk
                </Link>
              )}
              {pathname !== '/register' && (
                <Link href="/register" className="rounded-lg bg-[#07375c] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#052c4a] sm:text-sm">
                  Daftar Akun
                </Link>
              )}
            </div>
          </div>
        </header>

        <div className="pt-16">{children}</div>
      </div>
    );
  }

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
      <div className="px-4 pb-2 pt-5">
        <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Menu Utama</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Navigasi utama">
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => mobile && setIsMobileMenuOpen(false)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white text-[#07375c] shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-sky-300 dark:ring-slate-800'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                }`}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-[#07375c] dark:bg-sky-400" />}
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <LogOut className="h-4 w-4" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex h-full items-center">
          <div className="flex h-full w-full items-center px-4 lg:w-64 lg:shrink-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-800">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="mr-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-900"
              aria-label="Buka menu"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href={currentUser.role === 'admin' ? '/admin' : '/dashboard'} className="flex min-w-0 items-center gap-2.5">
              <LontarLogo priority className="shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" />
              <div className="min-w-0">
                <span className="block text-sm font-bold tracking-[0.12em] text-[#07375c] dark:text-sky-300">LONTAR</span>
                <span className="hidden truncate text-[9px] font-medium text-slate-500 xl:block">LMS Online & Pelatihan Terpadu</span>
              </div>
            </Link>

            <div className="ml-auto flex min-w-0 items-center gap-3 lg:hidden">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="max-w-[180px] truncate text-xs font-semibold text-slate-900 dark:text-white">{currentUser.full_name}</p>
                <p className="truncate text-[10px] capitalize text-slate-500">{currentUser.role}</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-end px-4 sm:px-6 lg:flex">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0 text-right">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{currentUser.full_name}</p>
                <p className="truncate text-[10px] capitalize text-slate-500">{currentUser.role} • {currentUser.institution}</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 z-30 hidden w-64 border-r border-slate-200 bg-slate-50 lg:block dark:border-slate-800 dark:bg-slate-950">
        <SidebarContent />
      </aside>

      <div className="pt-16 lg:pl-64">{children}</div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
          />
          <aside className="absolute bottom-0 left-0 top-0 w-[min(86vw,17rem)] border-r border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex h-16 items-center border-b border-slate-200 px-4 dark:border-slate-800">
              <Link
                href={currentUser.role === 'admin' ? '/admin' : '/dashboard'}
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex min-w-0 items-center gap-2.5"
              >
                <LontarLogo priority className="shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" />
                <span className="text-sm font-bold tracking-[0.12em] text-[#07375c] dark:text-sky-300">LONTAR</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-white dark:hover:bg-slate-900"
                aria-label="Tutup menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(100%-4rem)]">
              <SidebarContent mobile />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
