'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, FileText, Lock, Video } from 'lucide-react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Material, MaterialProgress, UserProfile } from '@/types';
import TimerWidget from '@/components/TimerWidget';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';
import LearningJourney from '@/components/LearningJourney';
import { formatGoogleDriveEmbedUrl, formatVideoEmbedUrl, getMediaType } from '@/lib/mediaUtils';

export default function MaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const materialId = (params?.id as string) || '';

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [progress, setProgress] = useState<MaterialProgress | null>(null);
  const [allProgress, setAllProgress] = useState<MaterialProgress[]>([]);
  const [isAccessAllowed, setIsAccessAllowed] = useState(true);
  const [accessErrorMsg, setAccessErrorMsg] = useState('');
  const [isTimerCompleted, setIsTimerCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleTimerComplete = useCallback(() => setIsTimerCompleted(true), []);

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

        const mats = StorageAPI.getMaterials().filter(m => m.active);
        setAllMaterials(mats);
        const targetMat = mats.find(m => m.id === materialId);
        if (!targetMat) {
          setAccessErrorMsg('Materi tidak ditemukan.');
          setIsAccessAllowed(false);
          setLoading(false);
          return;
        }
        setMaterial(targetMat);

        const preAttempts = StorageAPI.getTestAttempts(user.id, 'pretest');
        if (preAttempts.length === 0) {
          setIsAccessAllowed(false);
          setAccessErrorMsg('Anda wajib menyelesaikan Pre-Test terlebih dahulu sebelum mengakses materi.');
          setLoading(false);
          return;
        }

        const currentIdx = mats.findIndex(m => m.id === materialId);
        const userProgress = StorageAPI.getMaterialProgress(user.id);
        setAllProgress(userProgress);

        if (currentIdx > 0) {
          const prevMatId = mats[currentIdx - 1].id;
          const isPrevCompleted = userProgress.some(p => p.material_id === prevMatId && p.completed_at);
          if (!isPrevCompleted) {
            setIsAccessAllowed(false);
            setAccessErrorMsg(`Anda belum menyelesaikan materi sebelumnya (${mats[currentIdx - 1].title}). Selesaikan materi berurutan.`);
            setLoading(false);
            return;
          }
        }

        const p = await StorageAPI.startMaterial(user.id, targetMat.id);
        setProgress(p);
        if (p.completed_at || targetMat.minimum_duration_seconds <= 0) setIsTimerCompleted(true);
        setLoading(false);
      } catch (error) {
        setAccessErrorMsg(error instanceof Error ? error.message : 'Materi belum dapat dibuka.');
        setIsAccessAllowed(false);
        setLoading(false);
      }
    };
    void load();
  }, [materialId, router]);

  const handleCompleteMaterial = async () => {
    if (!currentUser || !material) return;
    try {
      await StorageAPI.completeMaterial(currentUser.id, material.id);
    } catch (error) {
      setAccessErrorMsg(error instanceof Error ? error.message : 'Materi belum dapat diselesaikan.');
      return;
    }

    const idx = allMaterials.findIndex(m => m.id === material.id);
    if (idx >= 0 && idx < allMaterials.length - 1) router.push(`/material/${allMaterials[idx + 1].id}`);
    else router.push('/posttest');
  };

  if (loading) {
    return <div className="mx-auto max-w-md py-16 text-center"><LontarLoadingSpinner size="lg" text="Memuat materi..." /></div>;
  }

  if (!isAccessAllowed || !material) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"><Lock className="h-7 w-7" /></div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Akses Terkunci</h2>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{accessErrorMsg}</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-[#07375c] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#052c4a]"><ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard</Link>
        </div>
      </div>
    );
  }

  const currentIndex = allMaterials.findIndex(m => m.id === material.id);
  const isLastMaterial = currentIndex === allMaterials.length - 1;
  const completedIds = new Set(allProgress.filter(item => item.completed_at).map(item => item.material_id));
  if (progress?.completed_at) completedIds.add(material.id);
  const completedCount = allMaterials.filter(item => completedIds.has(item.id)).length;
  const materialProgressPercent = allMaterials.length ? Math.round((completedCount / allMaterials.length) * 100) : 0;
  const previousMaterial = currentIndex > 0 ? allMaterials[currentIndex - 1] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 py-2">
      <LearningJourney activeStage="material" completed={{ pretest: true }} />

      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#07375c] dark:text-slate-400 dark:hover:text-sky-300"><ArrowLeft className="h-4 w-4" /> Dashboard</Link>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Materi {currentIndex + 1} dari {allMaterials.length}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="min-w-0 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="space-y-3 border-b border-slate-100 pb-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#07375c]/10 px-3 py-1 text-xs font-bold text-[#07375c] dark:bg-sky-400/10 dark:text-sky-300"><BookOpen className="h-3.5 w-3.5" /> Materi {currentIndex + 1}</span>
              <span className="text-[11px] font-medium text-slate-400">Minimal baca {material.minimum_duration_seconds} detik</span>
            </div>
            <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-white sm:text-3xl">{material.title}</h1>
            {material.description && <p className="text-sm leading-relaxed text-slate-500">{material.description}</p>}
          </div>

          {material.content_url && (() => {
            const mediaType = getMediaType(material.content_url);
            const embedUrl = mediaType === 'pdf' ? formatGoogleDriveEmbedUrl(material.content_url) : formatVideoEmbedUrl(material.content_url);
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    {mediaType === 'pdf' ? <FileText className="h-4 w-4 text-red-500" /> : <Video className="h-4 w-4 text-amber-500" />}
                    <span>{mediaType === 'pdf' ? 'Dokumen Pembelajaran' : 'Video Pembelajaran'}</span>
                  </div>
                  {mediaType === 'pdf' && <a href={material.content_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#07375c] hover:underline dark:text-sky-300">Buka file ↗</a>}
                </div>
                {mediaType === 'pdf' ? (
                  <div className="h-[62vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-inner dark:border-slate-800"><iframe src={embedUrl} title={material.title} className="h-full w-full border-0" allow="autoplay" /></div>
                ) : (
                  <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner"><iframe src={embedUrl} title={material.title} className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
                )}
              </div>
            );
          })()}

          {material.content && <div className="whitespace-pre-line text-sm leading-7 text-slate-800 dark:text-slate-200 sm:text-base">{material.content}</div>}

          {progress && (
            <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
              <TimerWidget minimumDurationSeconds={material.minimum_duration_seconds} startedAtIso={progress.started_at} onComplete={handleTimerComplete} isAlreadyCompleted={!!progress.completed_at} />
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              {previousMaterial && <Link href={`/material/${previousMaterial.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /> Sebelumnya</Link>}
            </div>
            <button onClick={handleCompleteMaterial} disabled={!isTimerCompleted} className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold transition-all sm:w-auto ${isTimerCompleted ? 'bg-[#07375c] text-white shadow-sm hover:bg-[#052c4a] dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300' : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600'}`}>
              {isTimerCompleted ? <>{isLastMaterial ? 'Selesai & Ke Post-Test' : 'Selesai & Berikutnya'} <ArrowRight className="h-4 w-4" /></> : <><Lock className="h-4 w-4" /> Tunggu waktu baca</>}
            </button>
          </div>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold text-slate-900 dark:text-white">Progres Materi</p><p className="text-[11px] text-slate-500">{completedCount} dari {allMaterials.length} selesai</p></div><span className="text-sm font-bold text-[#07375c] dark:text-sky-300">{materialProgressPercent}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-[#07375c] transition-all dark:bg-sky-400" style={{ width: `${materialProgressPercent}%` }} /></div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Daftar Materi</p>
            <div className="space-y-1">
              {allMaterials.map((item, index) => {
                const done = completedIds.has(item.id);
                const active = item.id === material.id;
                const unlocked = index === 0 || completedIds.has(allMaterials[index - 1]?.id);
                const itemClass = active ? 'border-[#07375c]/20 bg-[#07375c]/5 text-[#07375c] dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-transparent text-slate-600 dark:text-slate-400';
                return unlocked || active || done ? (
                  <Link key={item.id} href={`/material/${item.id}`} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${itemClass}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-[#07375c] text-white dark:bg-sky-400 dark:text-slate-950' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}</span>
                    <span className="line-clamp-2 min-w-0 flex-1">{item.title}</span>
                  </Link>
                ) : (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 dark:text-slate-600"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"><Lock className="h-3 w-3" /></span><span className="line-clamp-2">{item.title}</span></div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
