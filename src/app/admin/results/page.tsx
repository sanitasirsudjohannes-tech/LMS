'use client';

import React, { useEffect, useState } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Training } from '@/types';
import { Search, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, Filter, Sliders } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';

interface ResultRow {
  user_id: string;
  full_name: string;
  email: string;
  pre_score?: number | null;
  post_score?: number | null;
  post_attempts?: number;
  status: string;
  total_count: number;
}

interface OptimizedResultRow {
  user_id: string;
  full_name: string;
  email: string;
  pre_score?: number | null;
  best_post_score?: number | null;
  post_attempts?: number;
  status: string;
  total_count: number;
}

interface ParticipantFallbackRow extends ResultRow { institution?: string; }

const PAGE_SIZE = 20;

function ResultStatus({ status }: { status: string }) {
  if (status === 'Lulus') return <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold"><CheckCircle2 className="w-3 h-3" />Lulus</span>;
  if (status === 'Belum Lulus') return <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-bold"><XCircle className="w-3 h-3" />Belum Lulus</span>;
  return <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400"><Clock className="w-3 h-3" />{status}</span>;
}

export default function ResultsAdminPage() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [testFilter, setTestFilter] = useState<'all' | 'pretest' | 'posttest'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const list = StorageAPI.getTrainings();
        const selected = StorageAPI.getTraining() || list[0] || null;
        setTrainings(list);
        setSelectedTrainingId(selected?.id || '');
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Hasil tes gagal dimuat.');
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedTrainingId) return;
    let cancelled = false;
    const loadPage = async () => {
      setLoading(true); setLoadError(''); setUsingFallback(false);
      const optimized = await supabase.rpc('admin_training_results', {
        p_training_id: selectedTrainingId,
        p_search: debouncedSearch,
        p_test_filter: testFilter,
        p_limit: PAGE_SIZE,
        p_offset: (currentPage - 1) * PAGE_SIZE
      });
      if (cancelled) return;

      if (!optimized.error) {
        const result = (optimized.data || []) as OptimizedResultRow[];
        setRows(result.map(row => ({
          user_id: row.user_id, full_name: row.full_name, email: row.email,
          pre_score: row.pre_score, post_score: row.best_post_score,
          post_attempts: Number(row.post_attempts || 0), status: row.status,
          total_count: Number(row.total_count || 0)
        })));
        setTotalCount(Number(result[0]?.total_count || 0)); setLoading(false); return;
      }

      const fallback = await supabase.rpc('admin_training_participants', {
        p_training_id: selectedTrainingId, p_search: debouncedSearch, p_status: 'all', p_limit: 10000, p_offset: 0
      });
      if (cancelled) return;
      if (fallback.error) {
        setRows([]); setTotalCount(0); setLoadError(fallback.error.message);
      } else {
        const result = (fallback.data || []) as ParticipantFallbackRow[];
        const filtered = result.filter(row => testFilter === 'pretest' ? row.pre_score != null : testFilter === 'posttest' ? row.post_score != null : row.pre_score != null || row.post_score != null);
        const pageStart = (currentPage - 1) * PAGE_SIZE;
        setRows(filtered.slice(pageStart, pageStart + PAGE_SIZE)); setTotalCount(filtered.length); setUsingFallback(true);
      }
      setLoading(false);
    };
    void loadPage();
    return () => { cancelled = true; };
  }, [selectedTrainingId, debouncedSearch, testFilter, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Hasil Tes</h2><p className="text-xs text-slate-500 mt-0.5">Setiap peserta ditampilkan satu kali dengan nilai terbaiknya.</p></div>
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 w-full md:w-auto">
          <Sliders className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
          <select value={selectedTrainingId} onChange={event => { setSelectedTrainingId(event.target.value); StorageAPI.setSelectTraining(event.target.value); setCurrentPage(1); }} className="w-full md:w-[260px] bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none pr-2 py-1.5 truncate">
            {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
            {trainings.map(training => <option key={training.id} value={training.id}>{training.active ? 'AKTIF' : 'NONAKTIF'} — {training.title}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:flex-1"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" /><input value={search} onChange={event => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Cari nama atau email peserta..." className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-800"><Filter className="h-4 w-4 text-slate-400" /><select value={testFilter} onChange={event => { setTestFilter(event.target.value as 'all' | 'pretest' | 'posttest'); setCurrentPage(1); }} className="bg-transparent py-2 text-xs font-semibold text-slate-800 focus:outline-none dark:text-slate-200"><option value="all">Semua Tes</option><option value="pretest">Sudah Pre-Test</option><option value="posttest">Sudah Post-Test</option></select></div>
      </div>

      {loadError && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"><strong>Hasil tes gagal dimuat.</strong> {loadError}</div>}
      {usingFallback && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Mode kompatibilitas aktif. Beberapa filter atau pergantian halaman mungkin terasa lebih lambat.</div>}

      <div className="md:hidden space-y-3">
        {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"><LontarLoadingSpinner size="md" text="Memuat hasil tes..." /></div> : rows.length ? rows.map(row => (
          <div key={row.user_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{row.full_name}</h3><p className="text-[11px] text-slate-500 truncate">{row.email}</p></div><ResultStatus status={row.status} /></div>
            <div className="grid grid-cols-3 gap-2 mt-4 text-center"><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2"><span className="block text-[10px] text-slate-400">Pre-Test</span><strong className="text-sm font-mono">{row.pre_score ?? '-'}</strong></div><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2"><span className="block text-[10px] text-slate-400">Post-Test</span><strong className="text-sm font-mono">{row.post_score ?? '-'}</strong></div><div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-2"><span className="block text-[10px] text-slate-400">Percobaan</span><strong className="text-sm font-mono">{row.post_attempts ?? '-'}</strong></div></div>
          </div>
        )) : <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">Belum ada peserta yang sesuai dengan filter hasil tes.</div>}
      </div>

      <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider"><tr><th className="p-4">Peserta</th><th className="p-4 text-center">Pre-Test</th><th className="p-4 text-center">Post-Test Terbaik</th><th className="p-4 text-center">Percobaan</th><th className="p-4 text-center">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">{loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400"><LontarLoadingSpinner size="md" text="Memuat hasil tes..." /></td></tr> : rows.length ? rows.map(row => <tr key={row.user_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"><td className="p-4"><p className="font-bold text-slate-900 dark:text-white">{row.full_name}</p><p className="text-slate-400 text-[11px]">{row.email}</p></td><td className="p-4 text-center font-mono font-bold">{row.pre_score ?? '-'}</td><td className="p-4 text-center font-mono text-base font-bold">{row.post_score ?? '-'}</td><td className="p-4 text-center font-mono">{row.post_attempts ?? '-'}</td><td className="p-4 text-center"><ResultStatus status={row.status} /></td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-slate-400">Belum ada peserta yang sesuai dengan filter hasil tes.</td></tr>}</tbody></table></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900 flex items-center justify-between text-xs text-slate-500"><span>{rows.length} dari {totalCount}</span><div className="flex items-center gap-2"><button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1 || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><span className="font-semibold text-slate-900 dark:text-white">{currentPage}/{totalPages}</span><button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div></div>
    </div>
  );
}
