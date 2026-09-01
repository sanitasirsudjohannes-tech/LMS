'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>&copy; {new Date().getFullYear()} LMS Pelatihan Online</span>
          <span>•</span>
          <span>Platform Minimalis & Mobile-First</span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/verify/SAMPLE123"
            className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Verifikasi Sertifikat</span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
