'use client';

import React, { useEffect, useState } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Training } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Search, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ResultRow {
  user_id: string; full_name: string; email: string; pre_score?: number | null;
  best_post_score?: number | null; post_attempts: number; status: string;
  last_submitted_at: string; total_count: number; all_count: number; pre_count: number; post_count: number;
}

const PAGE_SIZE = 20;

export default function ResultsAdminPage() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [testFilter, setTestFilter] = useState<'all' | 'pretest' | 'posttest'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState({ all: 0, pretest: 0, posttest: 0 });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const list = StorageAPI.getTrainings();
      const selected = StorageAPI.getTraining() || list[0] || null;
      setTrainings(list); setSelectedTrainingId(selected?.id || '');
    };
    load();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedTrainingId) return;
    let cancelled = false;
    const loadPage = async () => {
      setLoading(true);
      setLoadError('');
      const { data, error } = await supabase.rpc('admin_training_results', {
        p_training_id: selectedTrainingId, p_search: debouncedSearch,
        p_test_filter: testFilter, p_limit: PAGE_SIZE, p_offset: (currentPage - 1) * PAGE_SIZE
      });
      if (cancelled) return;
      if (error) { console.error(error); setRows([]); setTotalCount(0); setLoadError(error.message); }
      else {
        const result = (data || []) as ResultRow[];
        setRows(result); setTotalCount(Number(result[0]?.total_count || 0));
        if (!debouncedSearch) setCounts({ all: Number(result[0]?.all_count || 0), pretest: Number(result[0]?.pre_count || 0), posttest: Number(result[0]?.post_count || 0) });
      }
      setLoading(false);
    };
    loadPage();
    return () => { cancelled = true; };
  }, [selectedTrainingId, debouncedSearch, testFilter, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const selectFilter = (value: 'all' | 'pretest' | 'posttest') => { setTestFilter(value); setCurrentPage(1); };

  return <div className="space-y-6">
    <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div><h2 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan</h2><p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Setiap peserta diringkas dalam satu baris.</p></div>
      <select value={selectedTrainingId} onChange={event => { setSelectedTrainingId(event.target.value); StorageAPI.setSelectTraining(event.target.value); setCurrentPage(1); }} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white">
        {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
        {trainings.map(training => <option key={training.id} value={training.id}>{training.active ? 'AKTIF' : 'NONAKTIF'} — {training.title}</option>)}
      </select>
      <p className="text-[11px] text-blue-700 dark:text-blue-300">Terdapat <strong>{counts.all}</strong> peserta yang sudah mengerjakan tes.</p>
    </div>

    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="relative w-full md:w-80"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" /><input value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Cari nama peserta..." className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'Semua', counts.all], ['pretest', 'Pre-Test', counts.pretest], ['posttest', 'Post-Test', counts.posttest]] as const).map(([value, label, count]) => <button key={value} onClick={() => selectFilter(value)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${testFilter === value ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{label} ({count})</button>)}
      </div>
    </div>

    {loadError && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-800"><strong>Hasil tes gagal dimuat.</strong> {loadError}. Jalankan kembali file SQL optimasi versi terbaru.</div>}

    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider"><tr><th className="p-4">Peserta</th><th className="p-4 text-center">Pre-Test</th><th className="p-4 text-center">Post-Test Terbaik</th><th className="p-4 text-center">Percobaan Post-Test</th><th className="p-4 text-center">Status</th><th className="p-4">Terakhir Mengerjakan</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">{loading ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">Memuat data...</td></tr> : rows.length ? rows.map(row => <tr key={row.user_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"><td className="p-4"><p className="font-bold text-slate-900 dark:text-white">{row.full_name}</p><p className="text-slate-400 text-[11px]">{row.email}</p></td><td className="p-4 text-center font-mono font-bold">{row.pre_score ?? '-'}</td><td className="p-4 text-center font-mono text-base font-bold">{row.best_post_score ?? '-'}</td><td className="p-4 text-center font-mono font-bold">{row.post_attempts}</td><td className="p-4 text-center">{row.status === 'Lulus' ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="w-3 h-3" />Lulus</span> : row.status === 'Belum Lulus' ? <span className="inline-flex items-center gap-1 text-red-700 font-bold"><XCircle className="w-3 h-3" />Belum Lulus</span> : <span className="inline-flex items-center gap-1 text-slate-500"><Clock className="w-3 h-3" />Belum Post-Test</span>}</td><td className="p-4 text-slate-500">{formatDateIndonesian(row.last_submitted_at)}</td></tr>) : <tr><td colSpan={6} className="p-8 text-center text-slate-400">Belum ada peserta yang mengerjakan tes.</td></tr>}</tbody></table></div>
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500"><span>Menampilkan {rows.length} dari {totalCount} peserta</span><div className="flex items-center gap-2"><button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1 || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><span className="font-semibold text-slate-900 dark:text-white">Halaman {currentPage} dari {totalPages}</span><button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div></div>
    </div>
  </div>;
}
