'use client';

import React, { useState, useEffect } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { TestAttempt, UserProfile } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Search, FileCheck2, GraduationCap, CheckCircle2, XCircle } from 'lucide-react';

export default function ResultsAdminPage() {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState<'all' | 'pretest' | 'posttest'>('all');

  useEffect(() => {
    initLocalStorage();
    setAttempts(StorageAPI.getTestAttempts());
    setProfiles(StorageAPI.getProfiles());
  }, []);

  const getProfile = (userId: string) => {
    return profiles.find(p => p.id === userId);
  };

  const filtered = attempts.filter(a => {
    const prof = getProfile(a.user_id);
    const matchesSearch = !search || (prof && (
      prof.full_name.toLowerCase().includes(search.toLowerCase()) ||
      prof.email.toLowerCase().includes(search.toLowerCase())
    ));

    if (!matchesSearch) return false;
    if (testTypeFilter !== 'all' && a.test_type !== testTypeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari nama peserta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTestTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'all' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Semua Tes ({attempts.length})
          </button>
          <button
            onClick={() => setTestTypeFilter('pretest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'pretest' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Pre-Test
          </button>
          <button
            onClick={() => setTestTypeFilter('posttest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'posttest' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Post-Test
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
              {filtered.length > 0 ? (
                filtered.map((a) => {
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

    </div>
  );
}
