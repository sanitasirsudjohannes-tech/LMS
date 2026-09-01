'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Material, UserProfile, MaterialProgress } from '@/types';
import TimerWidget from '@/components/TimerWidget';
import { BookOpen, ArrowLeft, ArrowRight, Lock, Video, FileText } from 'lucide-react';
import Link from 'next/link';
import { getMediaType, formatGoogleDriveEmbedUrl, formatVideoEmbedUrl } from '@/lib/mediaUtils';

export default function MaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const materialId = (params?.id as string) || '';

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [progress, setProgress] = useState<MaterialProgress | null>(null);
  
  const [isAccessAllowed, setIsAccessAllowed] = useState<boolean>(true);
  const [accessErrorMsg, setAccessErrorMsg] = useState<string>('');
  const [isTimerCompleted, setIsTimerCompleted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const handleTimerComplete = useCallback(() => {
    setIsTimerCompleted(true);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        // Await initLocalStorage so Supabase data is ready before access check
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

      // Sequential Access Validation (PRD Section 11)
        const preAttempts = StorageAPI.getTestAttempts(user.id, 'pretest');
        if (preAttempts.length === 0) {
          setIsAccessAllowed(false);
          setAccessErrorMsg('Anda wajib menyelesaikan Pre-Test terlebih dahulu sebelum mengakses materi.');
          setLoading(false);
          return;
        }

        const currentIdx = mats.findIndex(m => m.id === materialId);
        const userProgress = StorageAPI.getMaterialProgress(user.id);

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

      // Record started_at
        const p = await StorageAPI.startMaterial(user.id, targetMat.id);
        setProgress(p);

      // Unlock button immediately if already completed or no timer required
        if (p.completed_at || targetMat.minimum_duration_seconds <= 0) {
          setIsTimerCompleted(true);
        }

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
    if (idx >= 0 && idx < allMaterials.length - 1) {
      router.push(`/material/${allMaterials[idx + 1].id}`);
    } else {
      router.push('/posttest');
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-12 text-center text-slate-500 text-sm space-y-2">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin mx-auto" />
        <p>Memuat materi...</p>
      </div>
    );
  }

  if (!isAccessAllowed || !material) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Akses Terkunci 🔒</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{accessErrorMsg}</p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentIndex = allMaterials.findIndex(m => m.id === material.id);
  const isLastMaterial = currentIndex === allMaterials.length - 1;

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      
      {/* Navigation Top */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
        </Link>
        <span className="text-xs font-bold text-slate-400 font-mono">
          Materi {currentIndex + 1} dari {allMaterials.length}
        </span>
      </div>

      {/* Main Material Card */}
      <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        
        {/* Title */}
        <div className="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Materi Ke-{material.order_number}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
            {material.title}
          </h1>
          {material.description && (
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{material.description}</p>
          )}
        </div>

        {/* Video / PDF Media Viewer */}
        {material.content_url && (() => {
          const mediaType = getMediaType(material.content_url);
          const embedUrl = mediaType === 'pdf'
            ? formatGoogleDriveEmbedUrl(material.content_url)
            : formatVideoEmbedUrl(material.content_url);

          return (
            <div className="space-y-2">
              {mediaType === 'pdf' ? (
                <>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-red-500" />
                      <span className="px-2.5 py-0.5 rounded bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 font-bold uppercase tracking-wider text-[11px]">
                        Dokumen PDF
                      </span>
                    </div>
                    <a
                      href={material.content_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>Buka File PDF ↗</span>
                    </a>
                  </div>
                  <div className="w-full h-[550px] rounded-xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-inner">
                    <iframe
                      src={embedUrl}
                      title={material.title}
                      className="w-full h-full border-0"
                      allow="autoplay"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Video className="w-4 h-4 text-amber-500" />
                    <span className="px-2.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold uppercase tracking-wider text-[11px]">
                      Video Pembelajaran
                    </span>
                  </div>
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-950 shadow-inner border border-slate-800">
                    <iframe
                      src={embedUrl}
                      title={material.title}
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Text Content */}
        <div className="space-y-3 pt-2 text-slate-800 dark:text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-line font-sans">
          {material.content}
        </div>

        {/* Timer Widget */}
        {progress && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <TimerWidget
              minimumDurationSeconds={material.minimum_duration_seconds}
              startedAtIso={progress.started_at}
              onComplete={handleTimerComplete}
              isAlreadyCompleted={!!progress.completed_at}
            />
          </div>
        )}

        {/* Bottom Action */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-slate-500">
            {isTimerCompleted
              ? 'Waktu baca telah terpenuhi. Klik tombol di kanan untuk melanjutkan.'
              : 'Selesaikan durasi baca minimum terlebih dahulu.'}
          </span>

          <button
            onClick={handleCompleteMaterial}
            disabled={!isTimerCompleted}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
              isTimerCompleted
                ? 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white'
                : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            {isTimerCompleted ? (
              <>
                <span>{isLastMaterial ? 'Selesaikan & Lanjut ke Post-Test' : 'Selesaikan & Materi Berikutnya'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Lanjut 🔒</span>
              </>
            )}
          </button>
        </div>

      </article>
    </div>
  );
}
