'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, BookOpen, CheckCircle2, Clock3, Search } from 'lucide-react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Training, UserProfile } from '@/types';
import { isTrainingAvailable } from '@/lib/utils';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';

type Filter = 'all' | 'ongoing' | 'completed';

type TrainingView = {
  training: Training;
  status: 'not_started' | 'ongoing' | 'completed';
  score: number | null;
  certificate: boolean;
};

export default function TrainingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<TrainingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const currentUser = StorageAPI.getCurrentUser();
        if (!currentUser) return void router.push('/login');
        if (currentUser.role === 'admin') return void router.push('/admin');
        setUser(currentUser);

        const trainings = StorageAPI.getTrainings().filter(training => isTrainingAvailable(training));
        const view = trainings.map(training => {
          const pre = StorageAPI.getTestAttempts(currentUser.id, 'pretest', training.id);
          const post = StorageAPI.getTestAttempts(currentUser.id, 'posttest', training.id);
          const passed = post.some(attempt => attempt.score >= training.passing_score);
          const cert = Boolean(StorageAPI.getCertificateForUser(currentUser.id, training.id));
          const bestScore = post.length ? Math.max(...post.map(attempt => attempt.score)) : null;
          return {
            training,
            status: cert || passed ? 'completed' as const : pre.length > 0 || post.length > 0 ? 'ongoing' as const : 'not_started' as const,
            score: bestScore,
            certificate: cert,
          };
        });
        setItems(view);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const filtered = useMemo(() => items.filter(item => {
    const matchesFilter = filter === 'all' || (filter === 'ongoing' ? item.status === 'ongoing' : item.status === 'completed');
    const text = `${item.training.title} ${item.training.description || ''}`.toLowerCase();
    return matchesFilter && text.includes(query.trim().toLowerCase());
  }), [items, filter, query]);

  const openTraining = async (training: Training) => {
    StorageAPI.setSelectTraining(training.id);
    await StorageAPI.loadTrainingResources(training.id);
    router.push('/dashboard');
  };

  if (loading || !user) return <div className="mx-auto max-w-md py-16 text-center"><LontarLoadingSpinner size="lg" text="Memuat pelatihan Anda..." /></div>;

  const completedCount = items.filter(item => item.status === 'completed').length;
  const ongoingCount = items.filter(item => item.status === 'ongoing').length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-2">
      <section className="overflow-hidden rounded-3xl bg-[#07375c] p-6 text-white shadow-sm sm:p-8">
        <div className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-sky-200">Daftar Pelatihan</span>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Pelatihan Saya</h1>
          <p className="mt-2 text-sm leading-relaxed text-sky-100/80">Kelola seluruh pelatihan aktif, lanjutkan pembelajaran, dan lihat pelatihan yang sudah Anda selesaikan.</p>
        </div>
        <div className="mt-6 grid max-w-xl grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg bg-white/10 p-2 sm:p-3"><span className="block text-2xl font-bold">{items.length}</span><span className="text-xs font-semibold text-sky-100">Tersedia</span></div>
          <div className="rounded-lg bg-white/10 p-2 sm:p-3"><span className="block text-2xl font-bold">{ongoingCount}</span><span className="text-xs font-semibold text-sky-100">Berjalan</span></div>
          <div className="rounded-lg bg-white/10 p-2 sm:p-3"><span className="block text-2xl font-bold">{completedCount}</span><span className="text-xs font-semibold text-sky-100">Selesai</span></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {([['all','Semua'],['ongoing','Berjalan'],['completed','Selesai']] as [Filter,string][]).map(([value,label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold ${filter === value ? 'bg-[#07375c] text-white dark:bg-sky-400 dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{label}</button>)}
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Cari pelatihan" value={query} onChange={e => setQuery(e.target.value)} className="w-full bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400 dark:text-white sm:w-56" placeholder="Cari pelatihan..." /></label>
        </div>
      </section>

      {filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ training, status, score, certificate }) => {
            const completed = status === 'completed';
            const ongoing = status === 'ongoing';
            return (
              <article key={training.id} className="flex min-h-[245px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${completed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-[#07375c]/10 text-[#07375c] dark:bg-sky-400/10 dark:text-sky-300'}`}>{completed ? <CheckCircle2 className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${completed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : ongoing ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{completed ? 'Selesai' : ongoing ? 'Sedang Berjalan' : 'Belum Dimulai'}</span>
                </div>
                <h2 className="mt-4 line-clamp-2 text-base font-bold leading-snug text-slate-900 dark:text-white">{training.title}</h2>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{training.description || 'Pelatihan online LONTAR RSUD Prof. Dr. W.Z. Johannes Kupang.'}</p>
                <div className="mt-auto pt-5">
                  <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-500">{training.start_date && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800"><Clock3 className="h-3 w-3" /> {new Date(training.start_date).toLocaleDateString('id-ID')}</span>}{score !== null && <span className="rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800">Nilai terbaik: <strong>{score}</strong></span>}{certificate && <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><Award className="h-3 w-3" /> Sertifikat tersedia</span>}</div>
                  <button type="button" onClick={() => void openTraining(training)} className="w-full rounded-xl bg-[#07375c] px-4 py-3 text-xs font-bold text-white transition hover:bg-[#052c4a] dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300">{completed ? 'Lihat Pelatihan' : ongoing ? 'Lanjutkan Pelatihan' : 'Mulai Pelatihan'}</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900"><BookOpen className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">Tidak ada pelatihan pada filter ini</p><p className="mt-1 text-xs text-slate-500">Coba ubah filter atau kata pencarian.</p></div>
      )}
    </div>
  );
}
