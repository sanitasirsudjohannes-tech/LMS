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

export default function Navbar() {
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
        console.error('Gagal memulihkan sesi di sidebar:', error);
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

  if (authLoading || !currentUser) return null;

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
        <Link
          href={currentUser.role === 'admin' ? '/admin' : '/dashboard'}
          className="flex min-w-0 items-center gap-3"
          onClick={() => mobile && setIsMobileMenuOpen(false)}
        >
          <LontarLogo priority className="shrink-0 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700" />
          <div className="min-w-0">
            <span className="block text-sm font-bold tracking-[0.12em] text-[#07375c] dark:text-sky-300">LONTAR</span>
            <span className="block truncate text-[10px] font-medium text-slate-500">LMS Online & Pelatihan Terpadu</span>
          </div>
        </Link>
        {mobile && (
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Tutup menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Navigasi utama">
        <div className="space-y-1.5">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => mobile && setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{currentUser.full_name}</p>
            <p className="truncate text-[10px] capitalize text-slate-500">{currentUser.role} • {currentUser.institution}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <LogOut className="h-4 w-4" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur lg:hidden dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
        aria-label="Buka menu"
        aria-expanded={isMobileMenuOpen}
      >
        <Menu className="h-5 w-5" />
      </button>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
          />
          <aside className="relative h-full w-[min(86vw,18rem)] border-r border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <SidebarContent mobile />
          </aside>
        </div>
      )}
    </>
  );
}
