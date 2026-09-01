'use client';

import React, { useState, useEffect } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { TestAttempt, Training, UserProfile } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Search } from 'lucide-react';

export default function ResultsAdminPage() {
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [search, setSearch] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState<'all' | 'pretest' | 'posttest'>('all');

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      setAttempts(StorageAPI.getAllTestAttempts());
      setProfiles(StorageAPI.getProfiles());
      const trainingList = StorageAPI.getTrainings();
      const selectedTraining = StorageAPI.getTraining() || trainingList[0] || null;
      setTrainings(trainingList);
      setSelectedTrainingId(selectedTraining?.id || '');
    };
    load();
  }, []);

  const getProfile = (userId: string) => {
    return profiles.find(p => p.id === userId);
  };

  const trainingAttempts = attempts.filter(a => a.training_id === selectedTrainingId);

  const filtered = trainingAttempts.filter(a => {
    const prof = getProfile(a.user_id);
    const matchesSearch = !search || (prof && (
      prof.full_name.toLowerCase().includes(search.toLowerCase()) ||
      prof.email.toLowerCase().includes(search.toLowerCase())
    ));

    if (!matchesSearch) return false;
    if (testTypeFilter !== 'all' && a.test_type !== testTypeFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  const handleTrainingChange = (trainingId: string) => {
    setSelectedTrainingId(trainingId);
    if (trainingId) StorageAPI.setSelectTraining(trainingId);
  };

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
        <p className="text-[11px] text-blue-700 dark:text-blue-300">Ditemukan <strong>{trainingAttempts.length}</strong> riwayat pengerjaan tes.</p>
      </div>

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
            Semua Tes ({trainingAttempts.length})
          </button>
          <button
            onClick={() => setTestTypeFilter('pretest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'pretest' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Pre-Test ({trainingAttempts.filter(attempt => attempt.test_type === 'pretest').length})
          </button>
          <button
            onClick={() => setTestTypeFilter('posttest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
              testTypeFilter === 'posttest' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            Post-Test ({trainingAttempts.filter(attempt => attempt.test_type === 'posttest').length})
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
