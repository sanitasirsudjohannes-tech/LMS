'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  GraduationCap,
  Lock,
  PlayCircle,
  Sliders,
  Sparkles,
  Trophy,
} from 'lucide-react';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { isTrainingAvailable } from '@/lib/utils';
import { Certificate, Material, MaterialProgress, TestAttempt, Training, UserProfile } from '@/types';

function formatPosttestOpening(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' WITA';
}

function formatTrainingDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function getServerOffsetMs(): Promise<number> {
  const requestStartedAt = Date.now();
  try {
    const { data, error } = await supabase.rpc('lms_server_now');
    if (error) throw error;
    const responseReceivedAt = Date.now();
    const serverNowMs = new Date(String(data)).getTime();
    if (!Number.isFinite(serverNowMs)) return 0;
    const localMidpointMs = requestStartedAt + (responseReceivedAt - requestStartedAt) / 2;
    return serverNowMs - localMidpointMs;
  } catch {
    return 0;
  }
}

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
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [certificateNotice, setCertificateNotice] = useState('');

  const loadTrainingDetails = async (userId: string, tr: Training) => {
    await StorageAPI.loadTrainingResources(tr.id);
    setCertificateNotice('');

    if (tr.posttest_start_at) {
      setServerOffsetMs(await getServerOffsetMs());
    } else {
      setServerOffsetMs(0);
    }

    const mats = StorageAPI.getMaterials(tr.id).filter((m) => m.active);
    setMaterials(mats);

    const pre = StorageAPI.getTestAttempts(userId, 'pretest', tr.id);
    setPretestAttempt(pre.length > 0 ? pre[0] : null);

    const post = [...StorageAPI.getTestAttempts(userId, 'posttest', tr.id)].sort((a, b) => {
      const attemptDiff = (a.attempt_number || 0) - (b.attempt_number || 0);
      if (attemptDiff !== 0) return attemptDiff;
      return new Date(a.submitted_at || a.started_at || 0).getTime() - new Date(b.submitted_at || b.started_at || 0).getTime();
    });
    setPosttestAttempts(post);

    const mp = StorageAPI.getMaterialProgress(userId);
    setMaterialProgress(mp);

    let cert = StorageAPI.getCertificateForUser(userId, tr.id);
    const hasPassed = post.some((attempt) => attempt.score >= tr.passing_score);
    if (hasPassed && !cert) {
      try {
        cert = await StorageAPI.ensureMyCertificate(tr.id);
        if (!cert) {
          setCertificateNotice('Anda sudah lulus. Sertifikat akan tersedia setelah fitur sertifikat diaktifkan admin.');
        }
      } catch (error) {
        setCertificateNotice(error instanceof Error ? error.message : 'Sertifikat belum dapat diterbitkan.');
      }
    }
    setCertificate(cert);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const user = StorageAPI.getCurrentUser();
        if (!user) {
          router.push('/login');
          return;
        }
        if (user.role === 'admin') {
          router.push('/admin');
          return;
        }

        setCurrentUser(user);
        const listTr = StorageAPI.getTrainings().filter((training) => isTrainingAvailable(training));
        setTrainings(listTr);

        const previouslySelected = StorageAPI.getTraining();
        const initialTr = listTr.find((training) => training.id === previouslySelected?.id) || listTr[0];
        setSelectedTraining(initialTr);

        if (initialTr) {
          await loadTrainingDetails(user.id, initialTr);
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Dashboard gagal dimuat.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const handleSelectTraining = async (tr: Training) => {
    if (!currentUser) return;
    setSelectedTraining(tr);
    await loadTrainingDetails(currentUser.id, tr);
  };

  const completedMaterialIds = useMemo(
    () => materialProgress.filter((p) => p.completed_at).map((p) => p.material_id),
    [materialProgress],
  );

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center space-y-4">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
          Coba Lagi
        </button>
      </div>
    );
  }

  if (loading || !currentUser) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center py-16">
        <LontarLoadingSpinner size="lg" text="Memuat dashboard pelatihan..." />
      </div>
    );
  }

  const hasCompletedPretest = !!pretestAttempt;
  const completedMaterialsCount = materials.filter((m) => completedMaterialIds.includes(m.id)).length;
  const hasCompletedAllMaterials = materials.length === 0 || completedMaterialsCount === materials.length;
  const bestPosttestScore = posttestAttempts.reduce((max, a) => Math.max(max, a.score), 0);
  const passingScore = selectedTraining?.passing_score || 80;
  const isPassedPosttest = posttestAttempts.some((a) => a.score >= passingScore);
  const hasCertificate = !!certificate;
  const posttestOpeningMs = selectedTraining?.posttest_start_at ? new Date(selectedTraining.posttest_start_at).getTime() : null;
  const isPosttestTimeLocked = Boolean(
    selectedTraining?.posttest_start_at &&
      posttestOpeningMs !== null &&
      Number.isFinite(posttestOpeningMs) &&
      Date.now() + serverOffsetMs < posttestOpeningMs,
  );
  const posttestOpeningLabel = selectedTraining?.posttest_start_at ? formatPosttestOpening(selectedTraining.posttest_start_at) : '';

  const totalSteps = 1 + materials.length + 2;
  let currentStepPoints = 0;
  if (hasCompletedPretest) currentStepPoints += 1;
  currentStepPoints += completedMaterialsCount;
  if (isPassedPosttest) currentStepPoints += 1;
  if (hasCertificate) currentStepPoints += 1;
  const progressPercentage = Math.min(100, Math.round((currentStepPoints / totalSteps) * 100));

  let ctaLink = '/pretest';
  let ctaText = 'Mulai Pre-Test';
  let ctaSub = 'Langkah pertama sebelum membuka materi';
  let ctaDisabled = false;

  if (!hasCompletedPretest) {
    ctaLink = '/pretest';
    ctaText = 'Mulai Pre-Test';
    ctaSub = 'Kerjakan tes awal untuk memulai pelatihan';
  } else if (!hasCompletedAllMaterials) {
    const nextMat = materials.find((m) => !completedMaterialIds.includes(m.id)) || materials[0];
    ctaLink = nextMat ? `/material/${nextMat.id}` : '#';
    ctaText = nextMat ? `Lanjutkan ${nextMat.title.split(':')[0] || 'Materi'}` : 'Semua Materi Selesai';
    ctaSub = `Materi ${completedMaterialsCount + 1} dari ${materials.length}`;
  } else if (!isPassedPosttest && isPosttestTimeLocked) {
    ctaLink = '#';
    ctaText = 'Post-Test Belum Dibuka';
    ctaSub = `Dibuka ${posttestOpeningLabel}`;
    ctaDisabled = true;
  } else if (!isPassedPosttest) {
    ctaLink = '/posttest';
    ctaText = 'Mulai Post-Test';
    ctaSub = `Nilai kelulusan minimum ${passingScore}`;
  } else if (hasCertificate) {
    ctaLink = '/certificate';
    ctaText = 'Lihat Sertifikat';
    ctaSub = 'Pelatihan selesai. Sertifikat Anda sudah tersedia';
  } else {
    ctaLink = '/certificates';
    ctaText = 'Cek Arsip Sertifikat';
    ctaSub = 'Anda sudah lulus; sertifikat sedang menunggu penerbitan';
  }

  const trainingPeriod = selectedTraining
    ? [formatTrainingDate(selectedTraining.start_date), formatTrainingDate(selectedTraining.end_date)].filter(Boolean).join(' – ')
    : '';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 pt-1 sm:space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 px-5 py-6 text-white sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] backdrop-blur">
                <Building2 className="h-3.5 w-3.5" /> LONTAR Learning Portal
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-50">Selamat datang kembali,</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{currentUser.full_name}</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/90">
                  Lanjutkan pembelajaran Anda di RSUD Prof. Dr. W.Z. Johannes Kupang dan selesaikan tahapan pelatihan sampai sertifikat.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[360px]">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:p-4">
                <BookOpen className="mb-2 h-4 w-4 text-emerald-100" />
                <p className="text-xl font-bold sm:text-2xl">{trainings.length}</p>
                <p className="mt-0.5 text-[10px] font-medium text-emerald-50 sm:text-xs">Pelatihan</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:p-4">
                <Trophy className="mb-2 h-4 w-4 text-emerald-100" />
                <p className="text-xl font-bold sm:text-2xl">{isPassedPosttest ? 1 : 0}</p>
                <p className="mt-0.5 text-[10px] font-medium text-emerald-50 sm:text-xs">Lulus</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur sm:p-4">
                <Award className="mb-2 h-4 w-4 text-emerald-100" />
                <p className="text-xl font-bold sm:text-2xl">{hasCertificate ? 1 : 0}</p>
                <p className="mt-0.5 text-[10px] font-medium text-emerald-50 sm:text-xs">Sertifikat</p>
              </div>
            </div>
          </div>
        </div>

        {selectedTraining && (
          <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1.5fr_0.8fr] lg:gap-7">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <PlayCircle className="h-3.5 w-3.5" /> Sedang dipelajari
                </span>
                {trainingPeriod && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <CalendarDays className="h-3.5 w-3.5" /> {trainingPeriod}
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Lanjutkan pelatihan</p>
                <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">{selectedTraining.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {selectedTraining.description || 'Selesaikan setiap tahap secara berurutan untuk menyelesaikan pelatihan ini.'}
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Progress keseluruhan</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">{progressPercentage}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-500" style={{ width: `${progressPercentage}%` }} />
                </div>
                <p className="text-[11px] text-slate-400">{currentStepPoints} dari {totalSteps} tahap telah selesai</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Langkah berikutnya</span>
              </div>
              {ctaDisabled ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-700 dark:text-slate-200">{ctaText}</p>
                      <p className="mt-1 text-xs leading-5">{ctaSub}</p>
                    </div>
                    <Lock className="mt-0.5 h-5 w-5 shrink-0" />
                  </div>
                </div>
              ) : (
                <Link href={ctaLink} className="group block rounded-2xl bg-slate-950 p-4 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white dark:text-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{ctaText}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300 dark:text-slate-600">{ctaSub}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.5fr]">
        <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Katalog Anda</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">Pelatihan tersedia</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{trainings.length}</span>
          </div>

          {trainings.length > 0 ? (
            <div className="space-y-3">
              {trainings.map((training) => {
                const isSelected = selectedTraining?.id === training.id;
                const period = [formatTrainingDate(training.start_date), formatTrainingDate(training.end_date)].filter(Boolean).join(' – ');
                return (
                  <button
                    key={training.id}
                    type="button"
                    onClick={() => void handleSelectTraining(training)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                            <BookOpen className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-bold leading-5 text-slate-900 dark:text-white">{training.title}</p>
                            {period && <p className="mt-0.5 text-[11px] text-slate-400">{period}</p>}
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{training.description || 'Program pembelajaran LONTAR.'}</p>
                      </div>
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-transparent dark:border-slate-700'}`}>
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
              <Sliders className="mx-auto h-7 w-7 text-amber-500" />
              <h3 className="mt-3 text-sm font-bold text-amber-900 dark:text-amber-200">Belum ada pelatihan aktif</h3>
              <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">Pelatihan yang dipublikasikan admin akan muncul di sini.</p>
            </div>
          )}
        </section>

        {selectedTraining && (
          <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">Learning path</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">Tahapan pelatihan</h2>
              </div>
              <p className="max-w-md text-xs leading-5 text-slate-400 sm:text-right">Ikuti setiap langkah secara berurutan. Tahap berikutnya terbuka otomatis setelah syarat sebelumnya selesai.</p>
            </div>

            <div className="space-y-3">
              <TimelineItem
                icon={FileCheck2}
                title="Pre-Test"
                description={hasCompletedPretest ? `Selesai • Nilai ${pretestAttempt?.score}/100` : 'Tes awal sebelum materi pembelajaran'}
                state={hasCompletedPretest ? 'done' : 'active'}
                action={hasCompletedPretest ? <StatusPill label="Selesai" /> : <SmallAction href="/pretest" label="Mulai" />}
              />

              {materials.map((mat, idx) => {
                const isCompleted = completedMaterialIds.includes(mat.id);
                const isUnlocked = hasCompletedPretest && (idx === 0 || completedMaterialIds.includes(materials[idx - 1].id));
                return (
                  <TimelineItem
                    key={mat.id}
                    icon={BookOpen}
                    title={mat.title}
                    description={isCompleted ? 'Materi selesai dibaca' : `Durasi minimum ${mat.minimum_duration_seconds} detik`}
                    state={isCompleted ? 'done' : isUnlocked ? 'active' : 'locked'}
                    action={
                      isCompleted ? (
                        <SmallAction href={`/material/${mat.id}`} label="Baca Lagi" subtle />
                      ) : isUnlocked ? (
                        <SmallAction href={`/material/${mat.id}`} label="Buka" />
                      ) : (
                        <LockedLabel />
                      )
                    }
                  />
                );
              })}

              <TimelineItem
                icon={GraduationCap}
                title="Post-Test"
                description={
                  isPassedPosttest
                    ? `Lulus • Nilai terbaik ${bestPosttestScore}/100`
                    : isPosttestTimeLocked
                      ? `Dibuka ${posttestOpeningLabel}`
                      : posttestAttempts.length > 0
                        ? `Percobaan ${posttestAttempts.length}/${selectedTraining.max_posttest_attempts} • Nilai terakhir ${posttestAttempts.at(-1)?.score}`
                        : `Nilai kelulusan ${selectedTraining.passing_score}`
                }
                state={isPassedPosttest ? 'done' : hasCompletedAllMaterials && !isPosttestTimeLocked ? 'active' : 'locked'}
                action={
                  isPassedPosttest ? (
                    <StatusPill label="Lulus" />
                  ) : hasCompletedAllMaterials && !isPosttestTimeLocked ? (
                    <SmallAction href="/posttest" label="Mulai" />
                  ) : (
                    <LockedLabel label={isPosttestTimeLocked ? 'Belum Dibuka' : 'Terkunci'} />
                  )
                }
              />

              {certificateNotice && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {certificateNotice}
                </div>
              )}

              <TimelineItem
                icon={Award}
                title="Sertifikat Digital"
                description={hasCertificate ? 'Sertifikat tersedia untuk dilihat dan diunduh' : isPassedPosttest ? 'Menunggu penerbitan sertifikat' : 'Tersedia setelah lulus Post-Test'}
                state={hasCertificate ? 'certificate' : 'locked'}
                action={
                  hasCertificate ? (
                    <Link
                      href="/certificate"
                      onClick={() => certificate && StorageAPI.selectCertificate(certificate.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-600"
                    >
                      Lihat <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <LockedLabel />
                  )
                }
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

type TimelineState = 'done' | 'active' | 'locked' | 'certificate';

type TimelineItemProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  state: TimelineState;
  action: React.ReactNode;
};

function TimelineItem({ icon: Icon, title, description, state, action }: TimelineItemProps) {
  const style = {
    done: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25',
    active: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
    locked: 'border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/30',
    certificate: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/25',
  }[state];

  const iconStyle = {
    done: 'bg-emerald-600 text-white',
    active: 'bg-slate-950 text-white dark:bg-white dark:text-slate-950',
    locked: 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
    certificate: 'bg-amber-500 text-white',
  }[state];

  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 sm:p-4 ${style}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconStyle}`}>
          {state === 'done' ? <CheckCircle2 className="h-5 w-5" /> : state === 'locked' ? <Lock className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{label}</span>;
}

function SmallAction({ href, label, subtle = false }: { href: string; label: string; subtle?: boolean }) {
  return (
    <Link href={href} className={subtle ? 'text-[11px] font-bold text-emerald-700 hover:underline dark:text-emerald-300' : 'inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950'}>
      {label}{!subtle && <ArrowRight className="h-3 w-3" />}
    </Link>
  );
}

function LockedLabel({ label = 'Terkunci' }: { label?: string }) {
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400"><Lock className="h-3 w-3" />{label}</span>;
}
