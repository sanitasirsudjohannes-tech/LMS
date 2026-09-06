'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileCheck2 } from 'lucide-react';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';
import LearningJourney from '@/components/LearningJourney';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { ParticipantQuestion, Training, UserProfile } from '@/types';
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
  const [activeQuestion, setActiveQuestion] = useState(0);
  const { session, answers, saveStatus, initialize, selectAnswer, submit } = useTestSession();

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const user = StorageAPI.getCurrentUser();
        if (!user) return void router.push('/login');
        if (user.role === 'admin') return void router.push('/admin');
        setCurrentUser(user);
        const tr = StorageAPI.getTraining();
        setTraining(tr);
        const existing = tr ? StorageAPI.getTestAttempts(user.id, 'pretest', tr.id) : [];
        if (existing.length > 0) {
          const qList = tr ? await StorageAPI.loadQuestionsForTest(tr.id, 'pretest') : [];
          setQuestions(qList);
          setSubmitted(true);
          setScore(existing[0].score);
        } else if (tr) {
          const [qList, activeSession] = await Promise.all([StorageAPI.loadQuestionsForTest(tr.id, 'pretest'), initialize(tr.id, 'pretest')]);
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

  const answeredCount = Object.keys(answers).length;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const currentQuestion = questions[activeQuestion];
  const unansweredIndexes = useMemo(() => questions.map((q, i) => answers[q.id] ? null : i).filter((i): i is number => i !== null), [questions, answers]);

  const handleSelect = (questionId: string, option: 'A' | 'B' | 'C' | 'D') => {
    if (submitted) return;
    selectAnswer(questionId, option);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !training) return;
    if (answeredCount < questions.length) {
      await Swal.fire({ icon: 'warning', title: 'Jawaban Belum Lengkap', text: `Masih ada ${questions.length - answeredCount} soal yang belum dijawab.`, confirmButtonText: 'Periksa Soal' });
      setActiveQuestion(unansweredIndexes[0] ?? 0);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submit();
      setScore(result.score);
      setSubmitted(true);
      await Swal.fire({ icon: 'success', title: 'Pre-Test Berhasil Dikirim', text: `Nilai Pre-Test Anda: ${result.score}/100.`, timer: 1800, showConfirmButton: false });
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
    router.push(materials.length > 0 ? `/material/${materials[0].id}` : '/dashboard');
  };

  if (loading) return <div className="mx-auto max-w-md py-16 text-center"><LontarLoadingSpinner size="lg" text="Memuat soal Pre-Test..." /></div>;

  if (!training || questions.length === 0) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40">
          <AlertCircle className="mx-auto h-9 w-9 text-amber-500" />
          <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Pre-Test Belum Tersedia</h2>
          <p className="text-xs text-amber-700 dark:text-amber-300">{submitError || 'Admin belum mengaktifkan pelatihan atau belum menambahkan soal Pre-Test.'}</p>
          <button onClick={() => router.push('/dashboard')} className="rounded-xl bg-[#07375c] px-4 py-2 text-xs font-semibold text-white">Kembali ke Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-2">
      <LearningJourney activeStage="pretest" completed={{}} />

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#07375c] dark:text-sky-300">Tahap 1 • Tes Awal</span>
          <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Pre-Test Pelatihan</h1>
          <p className="mt-1 text-xs text-slate-500">{training.title} • Nilai tidak menggugurkan peserta.</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#07375c]/10 text-[#07375c] dark:bg-sky-400/10 dark:text-sky-300"><FileCheck2 className="h-5 w-5" /></div>
      </div>

      {submitted && score !== null ? (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"><CheckCircle2 className="h-10 w-10" /></div>
          <div><h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pre-Test Selesai</h2><p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">Nilai ini digunakan sebagai gambaran kemampuan awal sebelum Anda mempelajari materi.</p></div>
          <div className="mx-auto w-full max-w-xs rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60"><span className="block text-xs font-semibold uppercase text-slate-500">Nilai Anda</span><span className="font-mono text-5xl font-bold text-[#07375c] dark:text-sky-300">{score}</span><span className="block text-xs text-slate-400">/ 100</span></div>
          <button onClick={handleContinueToMaterial} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#07375c] px-8 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-[#052c4a] dark:bg-sky-400 dark:text-slate-950 sm:w-auto">Lanjut ke Materi <ArrowRight className="h-4 w-4" /></button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold text-slate-900 dark:text-white">Progress Jawaban</p><p className="text-[11px] text-slate-500">{answeredCount}/{questions.length} terjawab</p></div><span className="text-sm font-bold text-[#07375c] dark:text-sky-300">{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-[#07375c] transition-all dark:bg-sky-400" style={{ width: `${progress}%` }} /></div>
              <p className="mt-3 text-[10px] text-slate-400">{saveStatus === 'saving' ? 'Menyimpan jawaban...' : saveStatus === 'saved' ? 'Jawaban tersimpan otomatis.' : saveStatus === 'local' ? 'Tersimpan di perangkat.' : 'Pilih jawaban pada setiap soal.'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Navigator Soal</p>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, index) => {
                  const answered = Boolean(answers[q.id]);
                  const active = index === activeQuestion;
                  return <button key={q.id} type="button" onClick={() => setActiveQuestion(index)} className={`aspect-square rounded-lg text-xs font-bold transition-all ${active ? 'bg-[#07375c] text-white ring-2 ring-[#07375c]/20 dark:bg-sky-400 dark:text-slate-950' : answered ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{index + 1}</button>;
                })}
              </div>
            </div>
          </aside>

          <div className="space-y-4">
            {submitError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{submitError}</div>}
            {currentQuestion && (
              <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
                <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#07375c] text-xs font-bold text-white dark:bg-sky-400 dark:text-slate-950">{activeQuestion + 1}</span><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Soal {activeQuestion + 1} dari {questions.length}</p><h3 className="text-base font-bold leading-relaxed text-slate-900 dark:text-white sm:text-lg">{currentQuestion.question}</h3></div></div>
                <div className="space-y-2.5">
                  {getDisplayOptions(currentQuestion, session?.id || '').map(opt => {
                    const isSelected = answers[currentQuestion.id] === opt.value;
                    return <button key={opt.value} type="button" onClick={() => handleSelect(currentQuestion.id, opt.value)} className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-medium transition-all ${isSelected ? 'border-[#07375c] bg-[#07375c] text-white shadow-sm dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${isSelected ? 'border-white/70 dark:border-slate-950/60' : 'border-slate-300 dark:border-slate-600'}`}>{opt.label}</span><span>{opt.text}</span></button>;
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => setActiveQuestion(i => Math.max(0, i - 1))} disabled={activeQuestion === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"><ArrowLeft className="h-4 w-4" /> Sebelumnya</button>
              {activeQuestion < questions.length - 1 ? (
                <button type="button" onClick={() => setActiveQuestion(i => Math.min(questions.length - 1, i + 1))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-5 py-3 text-xs font-bold text-white dark:bg-sky-400 dark:text-slate-950">Berikutnya <ArrowRight className="h-4 w-4" /></button>
              ) : (
                <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-xs font-bold text-white disabled:opacity-50 dark:bg-sky-400 dark:text-slate-950">{submitting ? 'Mengirim...' : `Kirim Pre-Test (${answeredCount}/${questions.length})`} <ArrowRight className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
