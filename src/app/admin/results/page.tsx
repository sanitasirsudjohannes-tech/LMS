'use client';

import React, { useState, useEffect } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { TestAttempt, Training, UserProfile } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Search } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 20;

export default function ResultsAdminPage() {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState<'all' | 'pretest' | 'posttest'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [typeCounts, setTypeCounts] = useState({ all: 0, pretest: 0, posttest: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const trainingList = StorageAPI.getTrainings();
      const selectedTraining = StorageAPI.getTraining() || trainingList[0] || null;
      setTrainings(trainingList);
      setSelectedTrainingId(selectedTraining?.id || '');
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
      let matchingIds: string[] | null = null;
      if (debouncedSearch) {
        const safeSearch = debouncedSearch.replace(/[%_,().]/g, ' ');
        const { data } = await supabase.from('profiles').select('id').or(`full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`).eq('role', 'peserta').limit(1000);
        matchingIds = (data || []).map(item => item.id);
        if (matchingIds.length === 0) {
          if (!cancelled) { setAttempts([]); setProfiles([]); setTotalCount(0); setLoading(false); }
          return;
        }
      }

      let query = supabase.from('test_attempts').select('*', { count: 'exact' }).eq('training_id', selectedTrainingId).order('submitted_at', { ascending: false });
      if (testTypeFilter !== 'all') query = query.eq('test_type', testTypeFilter);
      if (matchingIds) query = query.in('user_id', matchingIds);
      const from = (currentPage - 1) * PAGE_SIZE;
      const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (cancelled) return;
      if (error) { console.error(error); setAttempts([]); setTotalCount(0); setLoading(false); return; }
      const pageAttempts = (data || []) as TestAttempt[];
      const userIds = [...new Set(pageAttempts.map(item => item.user_id))];
      const { data: pageProfiles } = userIds.length ? await supabase.from('profiles').select('*').in('id', userIds) : { data: [] };
      setAttempts(pageAttempts); setProfiles((pageProfiles || []) as UserProfile[]); setTotalCount(count || 0); setLoading(false);
    };
    loadPage();
    return () => { cancelled = true; };
  }, [selectedTrainingId, debouncedSearch, testTypeFilter, currentPage]);

  useEffect(() => {
    if (!selectedTrainingId) return;
    Promise.all([
      supabase.from('test_attempts').select('id', { count: 'exact', head: true }).eq('training_id', selectedTrainingId),
      supabase.from('test_attempts').select('id', { count: 'exact', head: true }).eq('training_id', selectedTrainingId).eq('test_type', 'pretest'),
      supabase.from('test_attempts').select('id', { count: 'exact', head: true }).eq('training_id', selectedTrainingId).eq('test_type', 'posttest')
    ]).then(([all, pretest, posttest]) => setTypeCounts({ all: all.count || 0, pretest: pretest.count || 0, posttest: posttest.count || 0 }));
  }, [selectedTrainingId]);

  const getProfile = (userId: string) => {
    return profiles.find(p => p.id === userId);
  };

  const handleTrainingChange = (trainingId: string) => {
    setSelectedTrainingId(trainingId);
    if (trainingId) StorageAPI.setSelectTraining(trainingId);
    setCurrentPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan</h2>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Riwayat dan nilai tes di bawah hanya berasal dari pelatihan yang dipilih.</p>
        </div>
        <select
          value={selectedTrainingId}
          onChange={(event) => handleTrainingChange(event.target.value)}
          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
          {trainings.map(training => (
            <option key={training.id} value={training.id}>{training.active ? 'AKTIF' : 'NONAKTIF'} — {training.title}</option>
          ))}
        </select>
        <p className="text-[11px] text-blue-700 dark:text-blue-300">Ditemukan <strong>{typeCounts.all}</strong> riwayat pengerjaan tes.</p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari nama peserta..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setTestTypeFilter('all'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'all' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Semua Tes ({typeCounts.all})
          </button>
          <button
            onClick={() => { setTestTypeFilter('pretest'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'pretest' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Pre-Test ({typeCounts.pretest})
          </button>
          <button
            onClick={() => { setTestTypeFilter('posttest'); setCurrentPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'posttest' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Post-Test ({typeCounts.posttest})
          </button>
        </div>

      </div>

      {/* Attempts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="p-4">Peserta</th>
                <th className="p-4">Jenis Tes</th>
                <th className="p-4 text-center">Percobaan Ke-#</th>
                <th className="p-4 text-center">Nilai Final</th>
                <th className="p-4">Waktu Submit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Memuat data...</td></tr> : attempts.length > 0 ? (
                attempts.map((a) => {
                  const prof = getProfile(a.user_id);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-4">
                        <p className="font-bold text-slate-900 dark:text-white">{prof?.full_name || 'Peserta'}</p>
                        <p className="text-slate-400 text-[11px]">{prof?.email || '-'}</p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase ${
                          a.test_type === 'pretest' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300'
                        }`}>
                          {a.test_type}
                        </span>
                      </td>
                      <td className="p-4 text-center font-mono font-bold">{a.attempt_number}</td>
                      <td className="p-4 text-center font-mono text-base font-bold text-slate-900 dark:text-white">{a.score}</td>
                      <td className="p-4 text-slate-500">{formatDateIndonesian(a.submitted_at)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">Belum ada riwayat pengerjaan tes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Menampilkan {attempts.length} dari {totalCount} hasil</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1 || loading} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
          <span className="font-semibold text-slate-900 dark:text-white">Halaman {currentPage} dari {totalPages}</span>
          <button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || loading} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

    </div>
  );
}
