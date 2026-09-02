'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { UserProfile } from '@/types';
import { StorageAPI, initCurrentUser } from '@/lib/storage';
import { LogOut, Shield, User, Menu, X, Award } from 'lucide-react';
import LontarLogo from '@/components/LontarLogo';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const brandHref = currentUser
    ? currentUser.role === 'admin' ? '/admin' : '/dashboard'
    : 'https://lmsrsudjohannes.vercel.app';

  useEffect(() => {
    const load = async () => {
      setCurrentUser(await initCurrentUser());
    };
    load();
  }, [pathname]);

  const handleLogout = async () => {
    await StorageAPI.logout();
    setCurrentUser(null);
    router.push('/login');
  };

  // Hide navbar on print mode or verification code view if pure print
  if (pathname.startsWith('/verify/') && false) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <Link href={brandHref} className="flex items-center gap-2.5 group">
            <LontarLogo priority className="shadow-sm ring-1 ring-slate-200 transition-transform group-hover:scale-105 dark:ring-slate-700" />
            <div>
              <span className="font-bold text-[#07375c] dark:text-sky-300 tracking-[0.12em] text-base block">LONTAR</span>
              <span className="hidden min-[390px]:block text-[9px] text-slate-500 font-medium -mt-0.5">LMS Online & Pelatihan Terpadu</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {currentUser ? (
              <>
                {currentUser.role === 'admin' ? (
                  <>
                    <Link
                      href="/admin"
                      className={`text-sm font-medium transition-colors ${
                        pathname === '/admin' ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Ringkasan
                    </Link>
                    <Link
                      href="/admin/participants"
                      className={`text-sm font-medium transition-colors ${
                        pathname.startsWith('/admin/participants') ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Peserta
                    </Link>
                    <Link
                      href="/admin/materials"
                      className={`text-sm font-medium transition-colors ${
                        pathname.startsWith('/admin/materials') ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Materi
                    </Link>
                    <Link
                      href="/admin/questions"
                      className={`text-sm font-medium transition-colors ${
                        pathname.startsWith('/admin/questions') ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Soal
                    </Link>
                    <Link
                      href="/admin/certificates"
                      className={`text-sm font-medium transition-colors ${
                        pathname.startsWith('/admin/certificates') ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Sertifikat
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/dashboard"
                      className={`text-sm font-medium transition-colors ${
                        pathname === '/dashboard' ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Dashboard Saya
                    </Link>
                    <Link
                      href="/certificates"
                      className={`text-sm font-medium transition-colors ${
                        pathname === '/certificates' ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Arsip Sertifikat
                    </Link>
                  </>
                )}

                {/* User Badge & Actions */}
                <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800">
                  <div className="text-right hidden lg:block">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white leading-none">{currentUser.full_name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 capitalize">{currentUser.role} • {currentUser.institution}</p>
                  </div>

                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                    currentUser.role === 'admin'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {currentUser.role === 'admin' ? (
                      <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Admin</span>
                    ) : (
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> Peserta</span>
                    )}
                  </span>

                  <button
                    onClick={handleLogout}
                    title="Keluar"
                    className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-3 py-1.5"
                >
                  Masuk
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 px-4 py-1.5 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shadow-sm"
                >
                  Daftar Akun
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            {currentUser && (
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                {currentUser.full_name.split(' ')[0]}
              </span>
            )}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-2 pb-4 space-y-2">
          {currentUser ? (
            <>
              <div className="py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{currentUser.full_name}</p>
                <p className="text-xs text-slate-500">{currentUser.email} • {currentUser.institution}</p>
              </div>

              {currentUser.role === 'admin' ? (
                <>
                  <Link href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Ringkasan Admin
                  </Link>
                  <Link href="/admin/participants" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Kelola Peserta
                  </Link>
                  <Link href="/admin/materials" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Kelola Materi
                  </Link>
                  <Link href="/admin/questions" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Kelola Soal
                  </Link>
                  <Link href="/admin/certificates" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Sertifikat
                  </Link>
                  <Link href="/admin/certificate-settings" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Pengaturan Sertifikat
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Dashboard Saya
                  </Link>
                  <Link href="/certificates" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 py-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <Award className="w-4 h-4" /> Arsip Sertifikat
                  </Link>
                </>
              )}

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full text-left py-2 text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800"
              >
                <LogOut className="w-4 h-4" /> Keluar
              </button>
            </>
          ) : (
            <div className="space-y-2 pt-2">
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full text-center py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full text-center py-2 text-sm font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-lg"
              >
                Daftar Akun
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
