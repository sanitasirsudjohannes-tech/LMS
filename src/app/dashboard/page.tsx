'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { UserProfile, Training, Material, TestAttempt, MaterialProgress, Certificate } from '@/types';
import {
  FileCheck2,
  BookOpen,
  GraduationCap,
  Award,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sliders,
  Check,
  Building2
} from 'lucide-react';
import { isTrainingAvailable } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pretestAttempt, setPretestAttempt] = useState<TestAttempt | null>(null);
  const [posttestAttempts, setPosttestAttempts] = useState<TestAttempt[]>([]);
  const [materialProgress, setMaterialProgress] = useState<MaterialProgress[]>([]);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTrainingDetails = (userId: string, tr: Training) => {
    StorageAPI.setSelectTraining(tr.id);

    const mats = StorageAPI.getMaterials(tr.id).filter(m => m.active);
    setMaterials(mats);

    const pre = StorageAPI.getTestAttempts(userId, 'pretest', tr.id);
    setPretestAttempt(pre.length > 0 ? pre[0] : null);

    const post = StorageAPI.getTestAttempts(userId, 'posttest', tr.id);
    setPosttestAttempts(post);

    const mp = StorageAPI.getMaterialProgress(userId);
    setMaterialProgress(mp);

    const cert = StorageAPI.getCertificateForUser(userId, tr.id);
    setCertificate(cert);
  };

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const user = StorageAPI.getCurrentUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUser(user);

      const listTr = StorageAPI.getTrainings().filter(training => isTrainingAvailable(training));
      setTrainings(listTr);

      const previouslySelected = StorageAPI.getTraining();
      const initialTr = listTr.find(training => training.id === previouslySelected?.id) || listTr[0];
      setSelectedTraining(initialTr);

      if (initialTr) {
        loadTrainingDetails(user.id, initialTr);
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const handleSelectTraining = (tr: Training) => {
    if (!currentUser) return;
    setSelectedTraining(tr);
    loadTrainingDetails(currentUser.id, tr);
  };

  if (loading || !currentUser) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-slate-500 text-sm">
        Memuat dashboard pelatihan...
      </div>
    );
  }

  // Calculate Progress Logic
  const hasCompletedPretest = !!pretestAttempt;
  const completedMaterialIds = materialProgress.filter(p => p.completed_at).map(p => p.material_id);
  const completedMaterialsCount = materials.filter(m => completedMaterialIds.includes(m.id)).length;
  const hasCompletedAllMaterials = materials.length === 0 || completedMaterialsCount === materials.length;
  
  const bestPosttestScore = posttestAttempts.reduce((max, a) => Math.max(max, a.score), 0);
  const passingScore = selectedTraining?.passing_score || 80;
  const isPassedPosttest = posttestAttempts.some(a => a.score >= passingScore);
  const hasCertificate = !!certificate;

  const totalSteps = 1 + materials.length + 2;
  let currentStepPoints = 0;
  if (hasCompletedPretest) currentStepPoints += 1;
  currentStepPoints += completedMaterialsCount;
  if (isPassedPosttest) currentStepPoints += 1;
  if (hasCertificate) currentStepPoints += 1;

  const progressPercentage = Math.min(100, Math.round((currentStepPoints / totalSteps) * 100));

  // Determine Primary CTA Button
  let ctaLink = '/pretest';
  let ctaText = 'Mulai Pre-Test';
  let ctaSub = 'Wajib diselesaikan sebelum membuka materi';

  if (!hasCompletedPretest) {
    ctaLink = '/pretest';
    ctaText = 'Mulai Pre-Test';
    ctaSub = 'Langkah 1: Kerjakan tes awal';
  } else if (!hasCompletedAllMaterials) {
    const nextMat = materials.find(m => !completedMaterialIds.includes(m.id)) || materials[0];
    ctaLink = nextMat ? `/material/${nextMat.id}` : '#';
    ctaText = nextMat ? `Lanjut ${nextMat.title.split(':')[0] || 'Materi'}` : 'Semua Materi Selesai';
    ctaSub = `Materi ${completedMaterialsCount + 1} dari ${materials.length}`;
  } else if (!isPassedPosttest) {
    ctaLink = '/posttest';
    ctaText = 'Mulai Post-Test';
    ctaSub = `Passing grade minimum: ${passingScore}`;
  } else if (hasCertificate) {
    ctaLink = '/certificate';
    ctaText = 'Unduh Sertifikat PDF';
    ctaSub = 'Selamat! Pelatihan telah selesai diselesaikan';
  } else {
    ctaLink = '/certificates';
    ctaText = 'Cek Arsip Sertifikat';
    ctaSub = 'Anda lulus; sertifikat belum diterbitkan oleh sistem';
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      
      {/* Header Info Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/60 p-3.5">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">Learning Management System</p>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">RSUD Prof. Dr. W.Z. Johannes Kupang</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <span className="text-xs text-slate-500 font-medium">Selamat datang,</span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{currentUser.full_name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{currentUser.institution} {currentUser.nip_nik ? `• NIP: ${currentUser.nip_nik}` : ''}</p>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 w-fit">
            Peserta Pelatihan
          </span>
        </div>

        {/* Catalog of Available Trainings */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Daftar Pelatihan Yang Tersedia ({trainings.length})
            </span>
            <span className="text-[11px] text-slate-400">Pilih untuk mengikuti</span>
          </div>

          {trainings.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {trainings.map(t => {
                const isSelected = selectedTraining?.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelectTraining(t)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 shadow-sm ring-1 ring-slate-900 dark:ring-slate-100'
                        : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold leading-tight">{t.title}</h3>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white">
                            Pelatihan Dipilih
                          </span>
                        )}
                      </div>
                      <p className={`text-xs ${isSelected ? 'opacity-80' : 'text-slate-500'} line-clamp-1`}>
                        {t.description || 'Tidak ada deskripsi singkat.'}
                      </p>
                      {(t.start_date || t.end_date) && (
                        <div className={`text-[11px] font-mono mt-1 ${isSelected ? 'opacity-90' : 'text-blue-600 dark:text-blue-400'}`}>
                          📅 Periode: {t.start_date ? new Date(t.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Awal'} - {t.end_date ? new Date(t.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Selesai'}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isSelected ? (
                        <Check className="w-5 h-5 text-emerald-400 dark:text-emerald-600" />
                      ) : (
                        <span className="text-xs font-medium text-slate-500 hover:underline">Pilih ➔</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-6 text-center space-y-2">
              <Sliders className="w-8 h-8 text-amber-500 mx-auto" />
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">Belum Ada Pelatihan Aktif</h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 max-w-md mx-auto">
                Saat ini belum ada program pelatihan yang dipublikasikan atau diaktifkan oleh Administrator. Silakan hubungi tim diklat atau periksa kembali secara berkala.
              </p>
            </div>
          )}
        </div>

        {/* Selected Training Details & Progress */}
        {selectedTraining && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-700 dark:text-slate-300">Progres Pelatihan Ini ({selectedTraining.title})</span>
                <span className="text-slate-900 dark:text-white font-mono text-sm">{progressPercentage}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-slate-900 dark:bg-slate-100 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Primary CTA Button */}
            <div className="pt-2">
              <Link
                href={ctaLink}
                className="w-full py-3.5 px-6 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-xl text-sm transition-all shadow-md flex items-center justify-between group"
              >
                <div>
                  <span className="font-bold text-base block group-hover:translate-x-0.5 transition-transform">{ctaText}</span>
                  <span className="text-xs opacity-80 font-normal">{ctaSub}</span>
                </div>
                <ArrowRight className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Sequential Stages Steps */}
      {selectedTraining && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Tahapan Pelatihan: {selectedTraining.title}</h3>

          <div className="space-y-3">
            
            {/* Step 1: Pre-test */}
            <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              hasCompletedPretest
                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  hasCompletedPretest
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                }`}>
                  {hasCompletedPretest ? <CheckCircle2 className="w-5 h-5" /> : <FileCheck2 className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">1. Pre-Test</h4>
                  <p className="text-xs text-slate-500">
                    {hasCompletedPretest
                      ? `Selesai • Nilai: ${pretestAttempt?.score} / 100`
                      : 'Wajib dikerjakan sebelum materi terbuka'}
                  </p>
                </div>
              </div>

              {hasCompletedPretest ? (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-1 rounded-md">
                  Selesai ✓
                </span>
              ) : (
                <Link
                  href="/pretest"
                  className="px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg text-xs font-medium hover:opacity-90"
                >
                  Mulai
                </Link>
              )}
            </div>

            {/* Step 2..N: Materials */}
            {materials.map((mat, idx) => {
              const isCompleted = completedMaterialIds.includes(mat.id);
              const isUnlocked = hasCompletedPretest && (idx === 0 || completedMaterialIds.includes(materials[idx - 1].id));

              return (
                <div
                  key={mat.id}
                  className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                    isCompleted
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                      : isUnlocked
                      ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isUnlocked
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : isUnlocked ? (
                        <BookOpen className="w-4 h-4" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {idx + 2}. {mat.title}
                      </h4>
                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        <span>Durasi min: {mat.minimum_duration_seconds} detik</span>
                        {isCompleted && <span className="text-emerald-600 font-semibold">• Telah Dibaca</span>}
                      </p>
                    </div>
                  </div>

                  {isCompleted ? (
                    <Link
                      href={`/material/${mat.id}`}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                      Baca Lagi
                    </Link>
                  ) : isUnlocked ? (
                    <Link
                      href={`/material/${mat.id}`}
                      className="px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg text-xs font-medium hover:opacity-90"
                    >
                      Buka
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Terkunci
                    </span>
                  )}
                </div>
              );
            })}

            {/* Post-Test */}
            <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              isPassedPosttest
                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                : hasCompletedAllMaterials
                ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800 opacity-70'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  isPassedPosttest
                    ? 'bg-emerald-600 text-white'
                    : hasCompletedAllMaterials
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                }`}>
                  {isPassedPosttest ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : hasCompletedAllMaterials ? (
                    <GraduationCap className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {materials.length + 2}. Post-Test
                  </h4>
                  <p className="text-xs text-slate-500">
                    {isPassedPosttest
                      ? `LULUS • Nilai Terbaik: ${bestPosttestScore} / 100`
                      : posttestAttempts.length > 0
                      ? `Percobaan ${posttestAttempts.length}/${selectedTraining.max_posttest_attempts} • Nilai Terakhir: ${posttestAttempts[posttestAttempts.length - 1].score}`
                      : `Passing grade: ${selectedTraining.passing_score}`}
                  </p>
                </div>
              </div>

              {isPassedPosttest ? (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-1 rounded-md">
                  Lulus ✓
                </span>
              ) : hasCompletedAllMaterials ? (
                <Link
                  href="/posttest"
                  className="px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg text-xs font-medium hover:opacity-90"
                >
                  Mulai Test
                </Link>
              ) : (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Terkunci
                </span>
              )}
            </div>

            {/* Certificate Stage */}
            <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              isPassedPosttest
                ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60'
                : 'bg-slate-50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800 opacity-70'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  isPassedPosttest ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                }`}>
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {materials.length + 3}. Sertifikat Digital
                  </h4>
                  <p className="text-xs text-slate-500">
                    {isPassedPosttest ? 'Sertifikat telah diterbitkan & dapat diunduh' : 'Tersedia setelah lulus Post-Test'}
                  </p>
                </div>
              </div>

              {isPassedPosttest ? (
                <Link
                  href="/certificate"
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                >
                  Unduh PDF
                </Link>
              ) : (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Terkunci
                </span>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
