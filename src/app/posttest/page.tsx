'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { ParticipantQuestion, UserProfile, Training, TestAttempt } from '@/types';
import { GraduationCap, CheckCircle2, XCircle, ArrowRight, Lock, RefreshCw, Award, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useTestSession } from '@/hooks/useTestSession';
import { getDisplayOptions, orderTestQuestions } from '@/lib/testSession';

export default function PosttestPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [training, setTraining] = useState<Training | null>(null);
  const [questions, setQuestions] = useState<ParticipantQuestion[]>([]);
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [isAccessAllowed, setIsAccessAllowed] = useState(true);
  const [accessErrorMsg, setAccessErrorMsg] = useState('');
  
  const [lastAttemptScore, setLastAttemptScore] = useState<number | null>(null);
  const [isPassed, setIsPassed] = useState(false);
  const [certificateIssued, setCertificateIssued] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const { session, answers, saveStatus, initialize, selectAnswer, submit, beginNewAttempt } = useTestSession();

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

        const tr = StorageAPI.getTraining();
        setTraining(tr);
        if (!tr) {
          setIsAccessAllowed(false);
          setAccessErrorMsg('Belum ada pelatihan aktif yang dapat diikuti.');
          setLoading(false);
          return;
        }

      // Validate if all materials are completed (PRD Section 12)
        const materials = StorageAPI.getMaterials().filter(m => m.active);
        const userProgress = StorageAPI.getMaterialProgress(user.id);
        const materialIds = new Set(materials.map(material => material.id));
        const completedMats = new Set(
          userProgress
            .filter(progress => progress.completed_at && materialIds.has(progress.material_id))
            .map(progress => progress.material_id)
        );

        if (materials.length > 0 && completedMats.size < materials.length) {
          setIsAccessAllowed(false);
          setAccessErrorMsg('Anda belum menyelesaikan seluruh materi pelatihan. Selesaikan semua materi untuk membuka Post-Test.');
          setLoading(false);
          return;
        }

      // Check existing post-test attempts
        const existingAttempts = StorageAPI.getTestAttempts(user.id, 'posttest');
        setAttempts(existingAttempts);

        const qList = await StorageAPI.loadQuestionsForTest(tr.id, 'posttest');

        if (existingAttempts.length > 0) {
          const passed = existingAttempts.some(a => a.score >= tr.passing_score);
          setIsPassed(passed);
          let certificate = StorageAPI.getCertificateForUser(user.id, tr.id);
          if (passed && !certificate) {
            try {
              certificate = await StorageAPI.ensureMyCertificate(tr.id);
            } catch (error) {
              setSubmitError(error instanceof Error ? error.message : 'Sertifikat belum dapat diterbitkan.');
            }
          }
          setCertificateIssued(!!certificate);
          setLastAttemptScore(existingAttempts[existingAttempts.length - 1].score);

          if (passed || existingAttempts.length >= tr.max_posttest_attempts) {
            setIsSubmitted(true);
            setQuestions(qList);
          } else {
            const activeSession = await initialize(tr.id, 'posttest');
            setQuestions(orderTestQuestions(qList, activeSession.id));
          }
        } else {
          const activeSession = await initialize(tr.id, 'posttest');
          setQuestions(orderTestQuestions(qList, activeSession.id));
        }

        setLoading(false);
      } catch (error) {
        setIsAccessAllowed(false);
        setAccessErrorMsg(error instanceof Error ? error.message : 'Post-Test belum dapat dibuka.');
        setLoading(false);
      }
    };
    void load();
  }, [initialize, router]);

  const handleSelect = (questionId: string, option: 'A' | 'B' | 'C' | 'D') => {
    if (isSubmitted) return;
    selectAnswer(questionId, option);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !training) return;

    if (Object.keys(answers).length < questions.length) {
      alert('Mohon jawab seluruh pertanyaan Post-Test.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submit();
      const newAttempt = StorageAPI.getTestAttempts(currentUser.id, 'posttest', training.id).at(-1);
      if (newAttempt) setAttempts(prev => [...prev, newAttempt]);
      setLastAttemptScore(result.score);
      setIsPassed(result.passed);
      setCertificateIssued(result.certificate_issued);
      setIsSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Post-Test gagal dikirim.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetake = async () => {
    setSubmitError('');
    try {
      const activeSession = await beginNewAttempt();
      const qList = await StorageAPI.loadQuestionsForTest(activeSession.training_id, 'posttest');
      setQuestions(orderTestQuestions(qList, activeSession.id));
      setIsSubmitted(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Percobaan baru belum dapat dimulai.');
    }
  };

  if (loading || !currentUser || !training) {
    return <div className="max-w-md mx-auto py-12 text-center text-slate-500 text-sm">Memuat Post-Test...</div>;
  }

  if (!isAccessAllowed) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Post-Test Terkunci 🔒</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{accessErrorMsg}</p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-semibold"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-9 h-9 text-amber-500 mx-auto" />
          <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Post-Test Belum Tersedia</h2>
          <p className="text-xs text-amber-700 dark:text-amber-300">Admin belum menambahkan soal Post-Test untuk pelatihan ini.</p>
          <button onClick={() => router.push('/dashboard')} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold">Kembali ke Dashboard</button>
        </div>
      </div>
    );
  }

  const remainingAttempts = Math.max(0, training.max_posttest_attempts - attempts.length);

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Evaluasi Akhir</span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Post-Test Pelatihan</h1>
          <p className="text-xs text-slate-500 mt-0.5">Passing Grade: {training.passing_score} • Percobaan: {attempts.length}/{training.max_posttest_attempts}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-900 dark:text-white shrink-0 font-bold">
          <GraduationCap className="w-5 h-5" />
        </div>
      </div>

      {isSubmitted && lastAttemptScore !== null ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-6">
          {isPassed ? (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-3 py-1 rounded-full">
                  LULUS PELATIHAN ✓
                </span>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white pt-2">Selamat! Anda Lulus</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {certificateIssued
                    ? `Nilai Anda memenuhi passing grade (${training.passing_score}). Sertifikat pelatihan Anda telah resmi diterbitkan.`
                    : `Nilai Anda memenuhi passing grade (${training.passing_score}). Sertifikat belum diterbitkan; hubungi admin untuk memeriksa pengaturan sertifikat.`}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-sm">
                <XCircle className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/60 px-3 py-1 rounded-full">
                  BELUM LULUS
                </span>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white pt-2">Nilai Belum Memenuhi</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Nilai Anda belum mencapai passing grade ({training.passing_score}). Sisa kesempatan perbaikan: <strong>{remainingAttempts}</strong>.
                </p>
              </div>
            </>
          )}

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 inline-block w-full max-w-xs">
            <span className="text-xs text-slate-500 uppercase font-semibold block">Nilai Post-Test Terakhir</span>
            <span className="text-4xl font-bold text-slate-900 dark:text-white font-mono">{lastAttemptScore}</span>
            <span className="text-xs text-slate-400 block font-mono">/ 100</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {isPassed && certificateIssued ? (
              <Link
                href="/certificate"
                onClick={() => {
                  if (!currentUser || !training) return;
                  const certificate = StorageAPI.getCertificateForUser(currentUser.id, training.id);
                  if (certificate) StorageAPI.selectCertificate(certificate.id);
                }}
                className="w-full sm:w-auto px-8 py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-sm transition-all shadow-md inline-flex items-center justify-center gap-2"
              >
                <Award className="w-5 h-5" />
                <span>Lihat & Unduh Sertifikat</span>
              </Link>
            ) : isPassed ? (
              <Link
                href="/certificates"
                className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold rounded-xl text-sm transition-all inline-flex items-center justify-center gap-2"
              >
                <Award className="w-4 h-4" />
                <span>Cek Arsip Sertifikat</span>
              </Link>
            ) : remainingAttempts > 0 ? (
              <button
                onClick={handleRetake}
                className="w-full sm:w-auto px-6 py-3 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold rounded-xl text-sm transition-all inline-flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Ulangi Post-Test ({remainingAttempts} Sisa Percobaan)</span>
              </button>
            ) : (
              <div className="text-xs text-slate-500">
                Kesempatan post-test Anda telah habis ({training.max_posttest_attempts}x). Hubungi Admin jika memerlukan reset.
              </div>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {submitError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{submitError}</div>}
          {questions.map((q, qIdx) => (
            <div
              key={q.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4"
            >
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {qIdx + 1}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                  {q.question}
                </h3>
              </div>

              <div className="space-y-2 pt-1 pl-9">
                {getDisplayOptions(q, session?.id || '').map((opt) => {
                  const isSelected = answers[q.id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(q.id, opt.value)}
                      className={`w-full p-3 rounded-xl border text-left text-xs sm:text-sm font-medium transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-white text-white dark:border-slate-900 dark:text-slate-900 bg-white/20'
                          : 'border-slate-300 dark:border-slate-600 text-slate-500'
                      }`}>
                        {opt.label}
                      </span>
                      <span>{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              {Object.keys(answers).length} dari {questions.length} soal telah dijawab.
              <span className="block mt-1 text-[11px]">
                {saveStatus === 'saving' && 'Menyimpan jawaban...'}
                {saveStatus === 'saved' && 'Jawaban tersimpan otomatis.'}
                {saveStatus === 'local' && 'Tersimpan di perangkat; akan disinkronkan saat koneksi tersedia.'}
              </span>
            </span>

            <button
              type="submit"
              disabled={submitting || Object.keys(answers).length < questions.length}
              className="w-full sm:w-auto px-8 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white font-bold rounded-xl text-sm transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{submitting ? 'Mengirim...' : 'Kirim Jawaban Post-Test'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
