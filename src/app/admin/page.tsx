'use client';

import React, { useEffect, useState } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { AdminStats, Training } from '@/types';
import { Users, FileCheck2, BookOpen, GraduationCap, Award, CheckCircle2, XCircle, ArrowRight, Sliders, Check } from 'lucide-react';
import Link from 'next/link';

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      
      const listTr = StorageAPI.getTrainings();
      setTrainings(listTr);

      const currentTr = StorageAPI.getTraining();
      const initial = currentTr || listTr[0];
      setSelectedTraining(initial);

      const st = StorageAPI.getAdminStats();
      setStats(st);
    };
    load();
  }, []);

  const handleSelectTraining = (tr: Training) => {
    StorageAPI.setSelectTraining(tr.id);
    setSelectedTraining(tr);
    const st = StorageAPI.getAdminStats();
    setStats(st);
  };

  if (!stats) return null;

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
      
      {/* Active Trainings Catalog in Admin */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daftar Semua Pelatihan ({trainings.length})</h2>
            <p className="text-xs text-slate-500 mt-0.5">Klik salah satu pelatihan untuk melihat ringkasan statistik dan melakukan kelola materi/soal.</p>
          </div>
          <Link
            href="/admin/training-settings"
            className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap self-start sm:self-auto"
          >
            + Tambah / Kelola Pelatihan
          </Link>
        </div>

        {trainings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {trainings.map((t) => {
              const isSelected = selectedTraining?.id === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectTraining(t)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 shadow-md ring-1 ring-slate-900 dark:ring-slate-100'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        t.active
                          ? isSelected
                            ? 'bg-emerald-500 text-white'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {t.active ? 'Status Aktif' : 'Nonaktif'}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />}
                    </div>
                    <h3 className="text-sm font-bold leading-snug">{t.title}</h3>
                    <p className={`text-xs mt-1 line-clamp-2 ${isSelected ? 'opacity-80' : 'text-slate-500'}`}>
                      {t.description || 'Tidak ada deskripsi'}
                    </p>
                  </div>

                  <div className={`pt-2 border-t text-[11px] font-mono flex items-center justify-between ${
                    isSelected ? 'border-slate-800 dark:border-slate-200 opacity-90' : 'border-slate-200 dark:border-slate-700 text-slate-400'
                  }`}>
                    <span>Passing Score: {t.passing_score}</span>
                    <span>Percobaan: {t.max_posttest_attempts}x</span>
                  </div>
                </div>
              );
            })}
          </div>
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

      {/* Selected Training Active Banner */}
      {selectedTraining && (
        <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">Ringkasan Statistik Pelatihan Dipilih</span>
            <h3 className="text-base font-bold">{selectedTraining.title}</h3>
          </div>
          <div className="text-right text-xs text-slate-300 font-mono hidden sm:block">
            <p>Passing Score: {selectedTraining.passing_score}</p>
            <p>Maks. Post-Test: {selectedTraining.max_posttest_attempts}x</p>
          </div>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{card.title}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>

            <div className="space-y-0.5">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 dark:text-white">
                {(card.count ?? 0).toLocaleString('id-ID')}
              </span>
              <p className="text-[11px] text-slate-400">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Action Shortcuts */}
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
