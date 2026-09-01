'use client';

import React, { useEffect, useState } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Training } from '@/types';
import { Search, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

interface ParticipantFallbackRow extends ResultRow {
  institution?: string;
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const list = StorageAPI.getTrainings();
      const selected = StorageAPI.getTraining() || list[0] || null;
      setTrainings(list);
      setSelectedTrainingId(selected?.id || '');
    };
    load();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedTrainingId) {
      return;
    }

    let cancelled = false;
    const loadPage = async () => {
      setLoading(true);
      setLoadError('');
      setUsingFallback(false);

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
          user_id: row.user_id,
          full_name: row.full_name,
          email: row.email,
          pre_score: row.pre_score,
          post_score: row.best_post_score,
          post_attempts: Number(row.post_attempts || 0),
          status: row.status,
          total_count: Number(row.total_count || 0)
        })));
        setTotalCount(Number(result[0]?.total_count || 0));
        setLoading(false);
        return;
      }

      // Tetap tampilkan data saat SQL optimasi belum dikenali schema cache.
      const fallback = await supabase.rpc('admin_training_participants', {
        p_training_id: selectedTrainingId,
        p_search: debouncedSearch,
        p_status: 'all',
        p_limit: PAGE_SIZE,
        p_offset: (currentPage - 1) * PAGE_SIZE
      });
      if (cancelled) return;

      if (fallback.error) {
        setRows([]);
        setTotalCount(0);
        setLoadError(fallback.error.message);
      } else {
        const result = (fallback.data || []) as ParticipantFallbackRow[];
        const filtered = result.filter(row => {
          if (testFilter === 'pretest') return row.pre_score != null;
          if (testFilter === 'posttest') return row.post_score != null;
          return row.pre_score != null || row.post_score != null;
        });
        setRows(filtered);
        setTotalCount(Number(result[0]?.total_count || 0));
        setUsingFallback(true);
      }
      setLoading(false);
    };

    loadPage();
    return () => { cancelled = true; };
  }, [selectedTrainingId, debouncedSearch, testFilter, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan</h2>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Setiap peserta ditampilkan satu kali dengan nilai terbaiknya.</p>
        </div>
        <select
          value={selectedTrainingId}
          onChange={event => {
            setSelectedTrainingId(event.target.value);
            StorageAPI.setSelectTraining(event.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white"
        >
          {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
          {trainings.map(training => <option key={training.id} value={training.id}>{training.active ? 'AKTIF' : 'NONAKTIF'} — {training.title}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input value={search} onChange={event => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Cari nama atau email peserta..." className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-800">
          <Filter className="h-4 w-4 text-slate-400" />
          <select value={testFilter} onChange={event => { setTestFilter(event.target.value as 'all' | 'pretest' | 'posttest'); setCurrentPage(1); }} className="bg-transparent py-2 text-xs font-semibold text-slate-800 focus:outline-none dark:text-slate-200">
            <option value="all">Semua Tes</option>
            <option value="pretest">Sudah Pre-Test</option>
            <option value="posttest">Sudah Post-Test</option>
          </select>
        </div>
      </div>

      {loadError && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"><strong>Hasil tes gagal dimuat.</strong> {loadError}</div>}
      {usingFallback && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Mode kompatibilitas aktif. Jalankan <strong>supabase/sql/bugfix_stability_2026_09.sql</strong> agar jumlah halaman dan filter hasil tes sepenuhnya dihitung oleh database.</div>}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
              <tr><th className="p-4">Peserta</th><th className="p-4 text-center">Pre-Test</th><th className="p-4 text-center">Post-Test Terbaik</th><th className="p-4 text-center">Percobaan</th><th className="p-4 text-center">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Memuat data...</td></tr> : loadError ? <tr><td colSpan={5} className="p-8 text-center text-red-600">Data gagal dimuat. Periksa pesan kesalahan di atas.</td></tr> : rows.length ? rows.map(row => (
                <tr key={row.user_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="p-4"><p className="font-bold text-slate-900 dark:text-white">{row.full_name}</p><p className="text-slate-400 text-[11px]">{row.email}</p></td>
                  <td className="p-4 text-center font-mono font-bold">{row.pre_score ?? '-'}</td>
                  <td className="p-4 text-center font-mono text-base font-bold">{row.post_score ?? '-'}</td>
                  <td className="p-4 text-center font-mono">{row.post_attempts ?? '-'}</td>
                  <td className="p-4 text-center">{row.status === 'Lulus' ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="w-3 h-3" />Lulus</span> : row.status === 'Belum Lulus' ? <span className="inline-flex items-center gap-1 text-red-700 font-bold"><XCircle className="w-3 h-3" />Belum Lulus</span> : <span className="inline-flex items-center gap-1 text-slate-500"><Clock className="w-3 h-3" />{row.status}</span>}</td>
                </tr>
              )) : <tr><td colSpan={5} className="p-8 text-center text-slate-400">Belum ada peserta yang sesuai dengan filter hasil tes.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Menampilkan {rows.length} dari {totalCount} peserta</span>
          <div className="flex items-center gap-2"><button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1 || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><span className="font-semibold text-slate-900 dark:text-white">Halaman {currentPage} dari {totalPages}</span><button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div>
        </div>
      </div>
    </div>
  );
}
