'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TrainingStructureNotice({ trainingId }: { trainingId: string }) {
  const [status, setStatus] = useState<{ trainingId: string; locked: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trainingId) return;
    let cancelled = false;
    void (async () => {
      const { data, error: failure } = await supabase.rpc('admin_training_lock_status_list');
      if (cancelled) return;
      if (failure) { setError('Status penguncian belum dapat diperiksa. Muat ulang halaman sebelum mengubah struktur.'); return; }
      setError('');
      const row = (data as { training_id: string; locked: boolean }[] | null)?.find(item => item.training_id === trainingId);
      setStatus(row ? { trainingId, locked: row.locked } : null);
    })();
    return () => { cancelled = true; };
  }, [trainingId]);

  if (!trainingId) return null;
  const locked = status?.trainingId === trainingId && status.locked;
  return <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
    <p className="font-bold">{error ? 'Status belum tersedia' : locked ? 'Struktur pelatihan terkunci' : 'Perubahan struktur pelatihan'}</p>
    <p className="mt-1">{error || (locked
      ? 'Peserta sudah mulai. Soal, isi materi, durasi, urutan, status materi, nilai kelulusan, dan batas percobaan tidak dapat diubah. Mengembalikan pelatihan ke draf tidak membuka kunci. Buat pelatihan baru untuk struktur yang berbeda.'
      : 'Setelah peserta mulai, soal, materi, durasi, nilai kelulusan, dan batas percobaan akan terkunci. Perubahan struktur membatalkan hasil uji coba sebelumnya; ulangi uji coba sebelum publikasi.')}</p>
  </div>;
}
