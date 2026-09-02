import Link from 'next/link';
import { WifiOff, RotateCcw } from 'lucide-react';
import LontarLogo from '@/components/LontarLogo';

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-md items-center justify-center py-8">
      <div className="w-full space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <LontarLogo className="mx-auto ring-1 ring-slate-200 dark:ring-slate-700" />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <WifiOff className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tidak Ada Koneksi Internet</h1>
          <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            LONTAR membutuhkan internet untuk membuka materi, menyimpan jawaban tes, dan menerbitkan sertifikat dengan aman.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0b4d7d]"
        >
          <RotateCcw className="h-4 w-4" />
          Coba Lagi
        </Link>
      </div>
    </div>
  );
}
