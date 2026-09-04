'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { AdminStats, Training, TrainingStatus } from '@/types';
import { Users, FileCheck2, BookOpen, GraduationCap, Award, CheckCircle2, XCircle, ArrowRight, Check, Search } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const EMPTY_STATS: AdminStats = {
  totalParticipants: 0,
  completedPretest: 0,
  inProgressMaterials: 0,
  completedAllMaterials: 0,
  completedPosttest: 0,
  passed: 0,
  failed: 0,
  certificatesIssued: 0
};

type TrainingFilter = 'all' | TrainingStatus;

const TRAINING_FILTERS: Array<{ value: TrainingFilter; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: 'active', label: 'Aktif' },
  { value: 'draft', label: 'Draf' },
  { value: 'archived', label: 'Arsip' }
];

function getTrainingStatus(training: Training): TrainingStatus {
  return training.status || (training.active ? 'active' : 'archived');
}

function getStatusLabel(training: Training): string {
  const status = getTrainingStatus(training);
  if (status === 'active') return 'AKTIF • Tampil di Peserta';
  if (status === 'draft') return 'DRAF • Belum Dipublikasikan';
  return 'ARSIP • Tidak Tampil';
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [trainingSearch, setTrainingSearch] = useState('');
  const [trainingFilter, setTrainingFilter] = useState<TrainingFilter>('all');

  async function loadStats(trainingId: string) {
    setLoadingStats(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.rpc('admin_training_stats', { p_training_id: trainingId });
      if (error) throw new Error(error.message);
      setStats((data as AdminStats | null) || EMPTY_STATS);
    } catch (error) {
      setStats(EMPTY_STATS);
      setLoadError(`Gagal memuat statistik: ${error instanceof Error ? error.message : 'terjadi kesalahan koneksi.'}`);
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const listTr = StorageAPI.getTrainings();
        setTrainings(listTr);

        const currentTr = StorageAPI.getTraining();
        const initial = currentTr || listTr[0];
        setSelectedTraining(initial);

        if (initial) await loadStats(initial.id);
      } catch (error) {
        setLoadError(`Gagal memuat ringkasan: ${error instanceof Error ? error.message : 'terjadi kesalahan koneksi.'}`);
      }
    };
    void load();
  }, []);

  const handleSelectTraining = async (tr: Training) => {
    StorageAPI.setSelectTraining(tr.id);
    setSelectedTraining(tr);
    await loadStats(tr.id);
  };

  const filteredTrainings = useMemo(() => {
    const keyword = trainingSearch.trim().toLocaleLowerCase('id-ID');
    return [...trainings]
      .filter(training => trainingFilter === 'all' || getTrainingStatus(training) === trainingFilter)
      .filter(training => {
        if (!keyword) return true;
        return training.title.toLocaleLowerCase('id-ID').includes(keyword)
          || (training.description || '').toLocaleLowerCase('id-ID').includes(keyword);
      })
      .sort((a, b) => {
        if (a.id === selectedTraining?.id) return -1;
        if (b.id === selectedTraining?.id) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [trainings, trainingFilter, trainingSearch, selectedTraining?.id]);

  const visibleTrainings = filteredTrainings.slice(0, 6);
  const hiddenTrainingCount = Math.max(0, filteredTrainings.length - visibleTrainings.length);
  const passingScore = selectedTraining?.passing_score ?? 80;

  const statCards = [
    { title: 'Total Peserta', count: stats.totalParticipants, label: 'Kapasitas s.d 1.000 Peserta', icon: Users, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50' },
    { title: 'Sudah Pre-Test', count: stats.completedPretest, label: 'Menyelesaikan evaluasi awal', icon: FileCheck2, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50' },
    { title: 'Selesai Seluruh Materi', count: stats.completedAllMaterials, label: 'Membaca materi berurutan', icon: BookOpen, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50' },
    { title: 'Sudah Post-Test', count: stats.completedPosttest, label: 'Mengikuti evaluasi akhir', icon: GraduationCap, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50' },
    { title: 'Lulus Pelatihan', count: stats.passed, label: `Nilai >= ${passingScore}`, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50' },
    { title: 'Belum Lulus', count: stats.failed, label: `Nilai < ${passingScore}`, icon: XCircle, color: 'text-red-600 bg-red-50 dark:bg-red-950/50' },
    { title: 'Sertifikat Diterbitkan', count: stats.certificatesIssued, label: 'Siap verifikasi QR & PDF', icon: Award, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50' }
  ];

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <strong>Ringkasan gagal dimuat.</strong> {loadError}
          {selectedTraining && (
            <button type="button" onClick={() => loadStats(selectedTraining.id)} className="ml-2 font-bold underline">
              Coba lagi
            </button>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daftar Pelatihan</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ringkasan menampilkan maksimal 6 pelatihan. Pelatihan yang sedang dikelola selalu diprioritaskan.</p>
          </div>
          <Link
            href="/admin/training-settings"
            className="px-4 py-2 bg-[#07375c] hover:bg-[#052c4a] text-white rounded-xl text-xs font-semibold transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto"
          >
            + Tambah / Kelola Pelatihan
          </Link>
        </div>

        {trainings.length > 0 ? (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="search"
                  value={trainingSearch}
                  onChange={event => setTrainingSearch(event.target.value)}
                  placeholder="Cari nama atau deskripsi pelatihan..."
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                {TRAINING_FILTERS.map(filter => {
                  const active = trainingFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setTrainingFilter(filter.value)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${active
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {visibleTrainings.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleTrainings.map((t) => {
                  const isSelected = selectedTraining?.id === t.id;
                  const status = getTrainingStatus(t);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => handleSelectTraining(t)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 text-left ${
                        isSelected
                          ? 'bg-[#07375c] text-white border-[#052c4a] shadow-md ring-1 ring-[#07375c]'
                          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <div className="w-full">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            status === 'active'
                              ? isSelected
                                ? 'bg-emerald-500 text-white'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : status === 'draft'
                                ? isSelected
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : isSelected
                                  ? 'bg-slate-600 text-white dark:bg-slate-300 dark:text-slate-900'
                                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                            {getStatusLabel(t)}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />}
                        </div>
                        <h3 className="text-sm font-bold leading-snug">{t.title}</h3>
                        <p className={`text-xs mt-1 line-clamp-2 ${isSelected ? 'opacity-80' : 'text-slate-500'}`}>
                          {t.description || 'Tidak ada deskripsi'}
                        </p>
                      </div>

                      <div className={`w-full pt-2 border-t text-[11px] font-mono flex items-center justify-between ${
                        isSelected ? 'border-slate-800 dark:border-slate-200 opacity-90' : 'border-slate-200 dark:border-slate-700 text-slate-400'
                      }`}>
                        <span>Passing Score: {t.passing_score}</span>
                        <span>Percobaan: {t.max_posttest_attempts}x</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
                Tidak ada pelatihan yang sesuai dengan pencarian atau filter ini.
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-slate-500">
                Menampilkan {visibleTrainings.length} dari {filteredTrainings.length} hasil
                {hiddenTrainingCount > 0 ? ` • ${hiddenTrainingCount} lainnya tersedia di Kelola Pelatihan` : ''}.
              </p>
              <Link
                href="/admin/training-settings"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:underline self-start sm:self-auto"
              >
                Lihat Semua Pelatihan <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        ) : (
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center space-y-2">
            <p className="text-xs text-slate-500">Belum ada pelatihan yang terdaftar di database.</p>
            <Link
              href="/admin/training-settings"
              className="inline-block px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold"
            >
              + Tambah Pelatihan Pertama
            </Link>
          </div>
        )}
      </div>

      {selectedTraining && (
        <div className="bg-[#07375c] text-white rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4 border border-[#052c4a]">
          <div>
            <span className="text-[11px] font-bold text-sky-200 uppercase tracking-wider block">Ringkasan Pelatihan yang Sedang Dikelola</span>
            <h3 className="text-base font-bold">{selectedTraining.title}</h3>
          </div>
          <div className="text-right text-xs text-sky-100/90 font-mono hidden sm:block">
            <p>Passing Score: {selectedTraining.passing_score}</p>
            <p>Maks. Post-Test: {selectedTraining.max_posttest_attempts}x</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {statCards.map((card, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm space-y-2 sm:space-y-3 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-1.5">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-500 leading-tight line-clamp-2">{card.title}</span>
              <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                <card.icon className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>

            <div className="space-y-0.5 pt-1">
              <span className="text-xl sm:text-3xl font-bold font-mono text-slate-900 dark:text-white block">
                {loadingStats ? '…' : (card.count ?? 0).toLocaleString('id-ID')}
              </span>
              <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/admin/participants"
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-400 transition-colors flex items-center justify-between group"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kelola Peserta & Export CSV</h3>
            <p className="text-xs text-slate-500 mt-0.5">Cari, filter status, dan unduh laporan CSV</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          href="/admin/materials"
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-400 transition-colors flex items-center justify-between group"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kelola Materi {selectedTraining ? `(${selectedTraining.title})` : ''}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Atur urutan, deskripsi, dan timer minimum</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          href="/admin/questions"
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-slate-400 transition-colors flex items-center justify-between group"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kelola Soal Tes</h3>
            <p className="text-xs text-slate-500 mt-0.5">Edit pilihan ganda A, B, C, D & Kunci jawaban</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
