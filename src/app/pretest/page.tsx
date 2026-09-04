'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { ParticipantQuestion, UserProfile, Training } from '@/types';
import { FileCheck2, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { useTestSession } from '@/hooks/useTestSession';
import { getDisplayOptions, orderTestQuestions } from '@/lib/testSession';

export default function PretestPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [training, setTraining] = useState<Training | null>(null);
  const [questions, setQuestions] = useState<ParticipantQuestion[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const { session, answers, saveStatus, initialize, selectAnswer, submit } = useTestSession();

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

        const existing = StorageAPI.getTestAttempts(user.id, 'pretest');
        if (existing.length > 0) {
          const qList = tr ? await StorageAPI.loadQuestionsForTest(tr.id, 'pretest') : [];
          setQuestions(qList);
          setSubmitted(true);
          setScore(existing[0].score);
        } else if (tr) {
          const [qList, activeSession] = await Promise.all([
            StorageAPI.loadQuestionsForTest(tr.id, 'pretest'),
            initialize(tr.id, 'pretest')
          ]);
          setQuestions(orderTestQuestions(qList, activeSession.id));
        }

        setLoading(false);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Pre-Test belum dapat dibuka.');
        setLoading(false);
      }
    };
    void load();
  }, [initialize, router]);

  const handleSelect = (questionId: string, option: 'A' | 'B' | 'C' | 'D') => {
    if (submitted) return;
    selectAnswer(questionId, option);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !training) return;

    if (Object.keys(answers).length < questions.length) {
      await Swal.fire({
        icon: 'warning',
        title: 'Jawaban Belum Lengkap',
        text: 'Mohon jawab seluruh pertanyaan sebelum mengirimkan Pre-Test.',
        confirmButtonText: 'Mengerti'
      });
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submit();
      setScore(result.score);
      setSubmitted(true);
      await Swal.fire({
        icon: 'success',
        title: 'Pre-Test Berhasil Dikirim',
        text: `Nilai Pre-Test Anda: ${result.score}/100.`,
        timer: 1800,
        showConfirmButton: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pre-Test gagal dikirim.';
      setSubmitError(message);
      await Swal.fire('Pre-Test Gagal Dikirim', message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueToMaterial = () => {
    const materials = StorageAPI.getMaterials().filter(m => m.active);
    if (materials.length > 0) {
      router.push(`/material/${materials[0].id}`);
    } else {
      router.push('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <LontarLoadingSpinner size="lg" text="Memuat soal Pre-Test..." />
      </div>
    );
  }

  if (!training || questions.length === 0) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-9 h-9 text-amber-500 mx-auto" />
          <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Pre-Test Belum Tersedia</h2>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {submitError || 'Admin belum mengaktifkan pelatihan atau belum menambahkan soal Pre-Test.'}
          </p>
          <button onClick={() => router.push('/dashboard')} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold">Kembali ke Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-2">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Tahap 1</span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Pre-Test Pelatihan</h1>
          <p className="text-xs text-slate-500 mt-0.5">Uji kemampuan awal sebelum mempelajari materi.</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-900 dark:text-white shrink-0 font-bold">
          <FileCheck2 className="w-5 h-5" />
        </div>
      </div>

      {submitted && score !== null ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pre-Test Selesai!</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Terima kasih telah menyelesaikan tes awal. Nilai ini tidak menggugurkan Anda dan digunakan untuk mengukur peningkatan kompetensi.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 inline-block w-full max-w-xs">
            <span className="text-xs text-slate-500 uppercase font-semibold block">Nilai Pre-Test Anda</span>
            <span className="text-4xl font-bold text-slate-900 dark:text-white font-mono">{score}</span>
            <span className="text-xs text-slate-400 block font-mono">/ 100</span>
          </div>

          <div>
            <button
              onClick={handleContinueToMaterial}
              className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white font-bold rounded-xl text-sm transition-all shadow-md inline-flex items-center justify-center gap-2"
            >
              <span>Lanjut ke Materi 1</span>
              <ArrowRight className="w-4 h-4" />
            </button>
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
              <span>{submitting ? 'Mengirim...' : 'Kirim Jawaban Pre-Test'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
