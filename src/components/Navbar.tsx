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
  LogOut,
  Menu,
  MessageSquareText,
  Sliders,
  User,
  Users,
  X,
} from 'lucide-react';
import { StorageAPI, initCurrentUser } from '@/lib/storage';
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

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setAuthLoading(true);
      try {
        const user = await initCurrentUser();
        if (mounted) setCurrentUser(user);
      } catch (error) {
        console.error('Gagal memulihkan sesi di navigasi:', error);
        if (mounted) setCurrentUser(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    void load();
    return () => { mounted = false; };
  }, [pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await StorageAPI.logout();
    setCurrentUser(null);
    setAuthLoading(false);
    setIsMobileMenuOpen(false);
    router.push('/login');
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

  if (authLoading || !currentUser) {
    return <>{children}</>;
  }

  const homeHref = currentUser.role === 'admin' ? '/admin' : '/dashboard';

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full flex-col bg-slate-50/95 dark:bg-slate-950">
      {mobile && (
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Menu Navigasi</span>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Navigasi utama">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Navigasi</p>
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
                    ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                }`}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sky-600 dark:bg-sky-400" aria-hidden="true" />}
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <LogOut className="h-4 w-4" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex h-full items-center">
          <div className="flex h-full w-full items-center gap-3 px-4 lg:w-64 lg:border-r lg:border-slate-200 lg:px-5 dark:lg:border-slate-800">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Buka menu"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link href={homeHref} className="flex min-w-0 items-center gap-2.5">
              <LontarLogo priority className="shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" />
              <div className="min-w-0">
                <span className="block text-sm font-bold tracking-[0.12em] text-[#07375c] dark:text-sky-300">LONTAR</span>
                <span className="hidden truncate text-[9px] font-medium text-slate-500 sm:block">LMS Online & Pelatihan Terpadu</span>
              </div>
            </Link>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-end px-5 sm:flex">
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden min-w-0 text-right md:block">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{currentUser.full_name}</p>
                <p className="truncate text-[10px] capitalize text-slate-500">{currentUser.role} • {currentUser.institution}</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 z-40 hidden w-64 border-r border-slate-200 lg:block dark:border-slate-800">
        <SidebarContent />
      </aside>

      <div className="min-h-screen pt-16 lg:pl-64">
        {children}
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
          />
          <aside className="relative h-full w-[min(86vw,16rem)] border-r border-slate-200 bg-slate-50 shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <SidebarContent mobile />
          </aside>
        </div>
      )}
    </div>
  );
}
