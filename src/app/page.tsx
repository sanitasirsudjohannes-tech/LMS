'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { UserProfile } from '@/types';
import {
  BookOpen,
  CheckCircle,
  FileCheck2,
  GraduationCap,
  Lock,
  ArrowRight,
  ShieldCheck,
  Award,
  Sparkles,
  Users,
  Building2
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [verifyCodeInput, setVerifyCodeInput] = useState('');

  useEffect(() => {
    initLocalStorage();
    const user = StorageAPI.getCurrentUser();
    setCurrentUser(user);
  }, []);

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCodeInput.trim()) {
      router.push(`/verify/${verifyCodeInput.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-3xl mx-auto pt-6">
        <div className="flex items-center justify-center gap-3 text-emerald-800 dark:text-emerald-300">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-left leading-tight">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em]">Learning Management System</p>
            <p className="text-sm sm:text-base font-bold">RSUD Prof. Dr. W.Z. Johannes Kupang</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold tracking-wide border border-slate-200 dark:border-slate-700">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Platform Pelatihan dan Pengembangan Kompetensi</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
          LMS RSUD Johannes Kupang
        </h1>

        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
          Platform pembelajaran resmi milik RSUD Prof. Dr. W.Z. Johannes Kupang untuk memfasilitasi pelatihan, evaluasi, dan penerbitan sertifikat digital bagi peserta.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {currentUser ? (
            <Link
              href={currentUser.role === 'admin' ? '/admin' : '/dashboard'}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
            >
              <span>Buka {currentUser.role === 'admin' ? 'Dashboard Admin' : 'Dashboard Saya'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-xl text-sm transition-all shadow-sm"
              >
                <span>Masuk Akun</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-medium rounded-xl text-sm transition-all"
              >
                <span>Daftar Peserta Baru</span>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Alur Utama Section (Section 4 in PRD) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm space-y-8">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Alur Pembelajaran Berurutan</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Setiap tahap harus diselesaikan secara tertib. Sistem secara otomatis mengunci tahapan lanjutan.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
          {[
            { step: '1', title: 'Pendaftaran', desc: 'Buat akun peserta', icon: Users, done: true },
            { step: '2', title: 'Login', desc: 'Akses sistem', icon: Lock, done: true },
            { step: '3', title: 'Pre-Test', desc: 'Ukur awal kemampuan', icon: FileCheck2, done: true },
            { step: '4', title: 'Materi 1..N', desc: 'Timer minimum', icon: BookOpen, done: true },
            { step: '5', title: 'Post-Test', desc: 'Evaluasi akhir', icon: GraduationCap, done: true },
            { step: '6', title: 'Sertifikat', desc: 'Unduh PDF & QR', icon: Award, done: true }
          ].map((item, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-between text-slate-800 dark:text-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Langkah {item.step}</span>
              <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center text-slate-900 dark:text-white my-2">
                <item.icon className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Certificate Verification Quick Box */}
      <section className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-md">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Verifikasi Keaslian Sertifikat</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold">Punya Kode Sertifikat?</h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md">
              Masukkan kode verifikasi 10 karakter yang tertera pada sertifikat untuk mengecek keabsahannya secara langsung.
            </p>
          </div>

          <form onSubmit={handleVerifySubmit} className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Contoh: SAMPLE123"
              value={verifyCodeInput}
              onChange={(e) => setVerifyCodeInput(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-wider uppercase"
              required
            />
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors shadow-sm whitespace-nowrap"
            >
              Cek Sertifikat
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
