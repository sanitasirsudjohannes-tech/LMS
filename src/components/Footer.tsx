'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

export default function Footer() {
  const pathname = usePathname();
  const isVerificationPage = pathname.startsWith('/verify/');

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <span>&copy; {new Date().getFullYear()} LONTAR — RSUD Prof. Dr. W.Z. Johannes Kupang</span>
        </div>

        {isVerificationPage && (
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Verifikasi Sertifikat</span>
            </Link>
          </div>
        )}
      </div>
    </footer>
  );
}
