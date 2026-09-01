'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('LMS page error:', error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto py-16 text-center space-y-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Halaman tidak dapat dimuat</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Terjadi gangguan saat mengambil data LMS. Periksa koneksi lalu coba lagi.
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-5 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-sm font-semibold"
      >
        Coba Lagi
      </button>
    </div>
  );
}
