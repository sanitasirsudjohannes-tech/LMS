'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, Award, CheckCircle2, GraduationCap, Lock, RefreshCw, XCircle as XCircle2 } from 'lucide-react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { ParticipantQuestion, TestAttempt, Training, UserProfile } from '@/types';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';
import LearningJourney from '@/components/LearningJourney';
import { useTestSession } from '@/hooks/useTestSession';
import { getDisplayOptions, orderTestQuestions } from '@/lib/testSession';

function formatPosttestOpening(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' WITA';
}

function orderAttempts(attempts: TestAttempt[]): TestAttempt[] {
  return [...attempts].sort((a, b) => {
    const attemptDiff = (a.attempt_number || 0) - (b.attempt_number || 0);
    if (attemptDiff !== 0) return attemptDiff;
    return new Date(a.submitted_at || a.started_at || 0).getTime() - new Date(b.submitted_at || b.started_at || 0).getTime();
  });
}

async function getServerNowMs(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('lms_server_now');
    if (error) throw error;
    const value = new Date(String(data)).getTime();
    return Number.isFinite(value) ? value : Date.now();
  } catch {
    return Date.now();
  }
}

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
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [review, setReview] = useState({ material_rating: 0, material_ease_rating: 0, relevance_rating: 0, speaker_rating: 0, suggestion: '' });
  const { session, answers, saveStatus, initialize, selectAnswer, submit, beginNewAttempt } = useTestSession();

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
        if (!tr) {
          setIsAccessAllowed(false);
          setAccessErrorMsg('Belum ada pelatihan aktif yang dapat diikuti.');
          setLoading(false);
          return;
        }

        if (tr.posttest_start_at) {
          const serverNowMs = await getServerNowMs();
          const openingMs = new Date(tr.posttest_start_at).getTime();
          if (Number.isFinite(openingMs) && serverNowMs < openingMs) {
            setIsAccessAllowed(false);
            setAccessErrorMsg(`Post-Test belum dibuka oleh admin. Post-Test dapat dimulai pada ${formatPosttestOpening(tr.posttest_start_at)}.`);
            setLoading(false);
            return;
          }
        }

        const materials = StorageAPI.getMaterials().filter(m => m.active);
        const userProgress = StorageAPI.getMaterialProgress(user.id);
        const materialIds = new Set(materials.map(material => material.id));
        const completedMats = new Set(userProgress.filter(progress => progress.completed_at && materialIds.has(progress.material_id)).map(progress => progress.material_id));
        if (materials.length > 0 && completedMats.size < materials.length) {
          setIsAccessAllowed(false);
          setAccessErrorMsg('Anda belum menyelesaikan seluruh materi pelatihan. Selesaikan semua materi untuk membuka Post-Test.');
          setLoading(false);
          return;
        }

        const existingAttempts = orderAttempts(StorageAPI.getTestAttempts(user.id, 'posttest', tr.id));
        setAttempts(existingAttempts);
        const qList = await StorageAPI.loadQuestionsForTest(tr.id, 'posttest');

        if (existingAttempts.length > 0) {
          const passed = existingAttempts.some(a => a.score >= tr.passing_score);
          setIsPassed(passed);
          let certificate = StorageAPI.getCertificateForUser(user.id, tr.id);
          let hasReview = false;
          if (passed) {
            const { data: existingReview, error: reviewError } = await supabase.from('training_reviews').select('id').eq('training_id', tr.id).eq('user_id', user.id).maybeSingle();
            if (reviewError) throw new Error(`Status review pelatihan gagal diperiksa: ${reviewError.message}`);
            hasReview = !!existingReview;
            setReviewSubmitted(hasReview);
          }
          if (passed && hasReview && !certificate) {
            try { certificate = await StorageAPI.ensureMyCertificate(tr.id); }
            catch (error) { setSubmitError(error instanceof Error ? error.message : 'Sertifikat belum dapat diterbitkan.'); }
          }
          setCertificateIssued(!!certificate);
          setLastAttemptScore(existingAttempts.at(-1)?.score ?? null);
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

  const answeredCount = Object.keys(answers).length;
  const answerProgress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const currentQuestion = questions[activeQuestion];
  const unansweredIndexes = useMemo(() => questions.map((q, i) => answers[q.id] ? null : i).filter((i): i is number => i !== null), [questions, answers]);

  const handleSelect = (questionId: string, option: 'A' | 'B' | 'C' | 'D') => {
    if (isSubmitted) return;
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
      const refreshedAttempts = orderAttempts(StorageAPI.getTestAttempts(currentUser.id, 'posttest', training.id));
      setAttempts(refreshedAttempts);
      setLastAttemptScore(result.score);
      setIsPassed(result.passed);
      setCertificateIssued(result.certificate_issued);
      setIsSubmitted(true);
      await Swal.fire({ icon: result.passed ? 'success' : 'info', title: result.passed ? 'Selamat, Anda Lulus!' : 'Post-Test Berhasil Dikirim', text: result.passed ? `Nilai Anda ${result.score}/100 dan telah memenuhi passing grade. Silakan isi review pelatihan untuk menerbitkan sertifikat.` : `Nilai Anda ${result.score}/100. Anda masih dapat mencoba kembali jika kesempatan tersedia.`, timer: 2600, showConfirmButton: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Post-Test gagal dikirim.';
      setSubmitError(message);
      await Swal.fire('Post-Test Gagal Dikirim', message, 'error');
    } finally { setSubmitting(false); }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !training) return;
    if ([review.material_rating, review.material_ease_rating, review.relevance_rating, review.speaker_rating].some(v => v < 1 || v > 5)) {
      await Swal.fire('Review Belum Lengkap', 'Mohon beri penilaian pada seluruh pertanyaan review.', 'warning');
      return;
    }
    setReviewSubmitting(true);
    try {
      const { error } = await supabase.from('training_reviews').upsert({ training_id: training.id, user_id: currentUser.id, material_rating: review.material_rating, material_ease_rating: review.material_ease_rating, relevance_rating: review.relevance_rating, speaker_rating: review.speaker_rating, suggestion: review.suggestion.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'training_id,user_id' });
      if (error) throw error;
      setReviewSubmitted(true);
      let certificate = StorageAPI.getCertificateForUser(currentUser.id, training.id);
      if (!certificate) certificate = await StorageAPI.ensureMyCertificate(training.id);
      setCertificateIssued(!!certificate);
      await Swal.fire({ icon: 'success', title: 'Terima kasih!', text: certificate ? 'Review tersimpan dan sertifikat Anda telah diterbitkan.' : 'Review tersimpan. Sertifikat akan tersedia setelah fitur sertifikat diaktifkan admin.', timer: 2200, showConfirmButton: false });
    } catch (error) {
      await Swal.fire('Review Gagal Disimpan', error instanceof Error ? error.message : 'Silakan coba kembali.', 'error');
    } finally { setReviewSubmitting(false); }
  };

  const handleRetake = async () => {
    setSubmitError('');
    try {
      const activeSession = await beginNewAttempt();
      const qList = await StorageAPI.loadQuestionsForTest(activeSession.training_id, 'posttest');
      setQuestions(orderTestQuestions(qList, activeSession.id));
      setActiveQuestion(0);
      setIsSubmitted(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Percobaan baru belum dapat dimulai.';
      setSubmitError(message);
      await Swal.fire('Percobaan Baru Gagal Dimulai', message, 'error');
    }
  };

  if (loading || !currentUser || !training) return <div className="mx-auto max-w-md py-16 text-center"><LontarLoadingSpinner size="lg" text="Memuat Post-Test..." /></div>;

  if (!isAccessAllowed) {
    return <div className="mx-auto max-w-md py-12"><div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"><Lock className="h-7 w-7" /></div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Post-Test Terkunci</h2><p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{accessErrorMsg}</p><Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-[#07375c] px-5 py-2.5 text-xs font-semibold text-white"><ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard</Link></div></div>;
  }

  if (questions.length === 0) {
    return <div className="mx-auto max-w-md py-12"><div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40"><AlertCircle className="mx-auto h-9 w-9 text-amber-500" /><h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Post-Test Belum Tersedia</h2><p className="text-xs text-amber-700 dark:text-amber-300">Admin belum menambahkan soal Post-Test untuk pelatihan ini.</p><button onClick={() => router.push('/dashboard')} className="rounded-xl bg-[#07375c] px-4 py-2 text-xs font-semibold text-white">Kembali ke Dashboard</button></div></div>;
  }

  const remainingAttempts = Math.max(0, training.max_posttest_attempts - attempts.length);

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-2">
      <LearningJourney activeStage="posttest" completed={{ pretest: true, material: true, posttest: isPassed, certificate: certificateIssued }} />

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#07375c] dark:text-sky-300">Tahap 3 • Evaluasi Akhir</span><h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Post-Test Pelatihan</h1><p className="mt-1 text-xs text-slate-500">Passing Grade {training.passing_score} • Percobaan {attempts.length}/{training.max_posttest_attempts}</p></div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#07375c]/10 text-[#07375c] dark:bg-sky-400/10 dark:text-sky-300"><GraduationCap className="h-5 w-5" /></div>
      </div>

      {isSubmitted && lastAttemptScore !== null ? (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          {isPassed ? (
            <><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400 dark:ring-emerald-950/30"><Award className="h-10 w-10" /></div><div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">Pelatihan Selesai ✓</span><h2 className="mt-4 text-3xl font-bold text-slate-900 dark:text-white">Selamat, Anda Lulus</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">{certificateIssued ? 'Seluruh tahapan telah selesai dan sertifikat Anda sudah tersedia.' : reviewSubmitted ? 'Review sudah tersimpan. Sertifikat belum tersedia; silakan cek kembali arsip sertifikat.' : 'Satu langkah terakhir: isi review singkat untuk menerbitkan sertifikat.'}</p></div></>
          ) : (
            <><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400"><XCircle2 className="h-9 w-9" /></div><div><span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-600 dark:bg-red-900/60 dark:text-red-300">Belum Lulus</span><h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">Nilai Belum Memenuhi</h2><p className="mx-auto mt-2 max-w-md text-xs text-slate-500">Passing grade {training.passing_score}. Sisa kesempatan perbaikan: <strong>{remainingAttempts}</strong>.</p></div></>
          )}

          <div className="mx-auto grid w-full max-w-lg gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"><span className="block text-[10px] font-bold uppercase text-slate-400">Nilai Terakhir</span><span className="font-mono text-3xl font-bold text-[#07375c] dark:text-sky-300">{lastAttemptScore}</span></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"><span className="block text-[10px] font-bold uppercase text-slate-400">Passing Grade</span><span className="font-mono text-3xl font-bold text-slate-900 dark:text-white">{training.passing_score}</span></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"><span className="block text-[10px] font-bold uppercase text-slate-400">Percobaan</span><span className="font-mono text-3xl font-bold text-slate-900 dark:text-white">{attempts.length}</span></div></div>

          {isPassed && !reviewSubmitted && (
            <form onSubmit={handleReviewSubmit} className="mx-auto w-full max-w-2xl space-y-5 border-t border-slate-200 pt-6 text-left dark:border-slate-700">
              <div><h3 className="text-lg font-bold text-slate-900 dark:text-white">Review Pelatihan</h3><p className="mt-1 text-xs text-slate-500">Berikan evaluasi singkat sebelum sertifikat diterbitkan.</p></div>
              {[
                ['material_rating', 'Bagaimana penilaian Anda terhadap materi yang disampaikan dalam pelatihan ini?'],
                ['material_ease_rating', 'Bagaimana tingkat kemudahan materi pelatihan untuk dipahami?'],
                ['relevance_rating', 'Seberapa relevan materi pelatihan dengan pekerjaan atau tugas Anda?'],
                ['speaker_rating', 'Bagaimana penilaian Anda terhadap penyampaian materi oleh narasumber/pemateri?']
              ].map(([key, label]) => (
                <div key={key} className="space-y-2"><p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</p><div className="grid grid-cols-5 gap-2">{[1,2,3,4,5].map(value => <button key={value} type="button" onClick={() => setReview(prev => ({ ...prev, [key]: value }))} className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition-all ${review[key as keyof typeof review] === value ? 'border-[#07375c] bg-[#07375c] text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{value}</button>)}</div><div className="flex justify-between text-[10px] text-slate-400"><span>Sangat Kurang</span><span>Sangat Baik</span></div></div>
              ))}
              <div className="space-y-2"><p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Saran atau masukan untuk pelatihan berikutnya</p><textarea value={review.suggestion} onChange={(e) => setReview(prev => ({ ...prev, suggestion: e.target.value }))} rows={4} maxLength={1000} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Tuliskan saran atau masukan..." /></div>
              <button type="submit" disabled={reviewSubmitting} className="w-full rounded-xl bg-[#07375c] px-6 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-sky-400 dark:text-slate-950">{reviewSubmitting ? 'Mengirim Review...' : 'Kirim Review & Lanjut ke Sertifikat'}</button>
            </form>
          )}

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            {isPassed && reviewSubmitted && certificateIssued ? <Link href="/certificate" onClick={() => { const certificate = StorageAPI.getCertificateForUser(currentUser.id, training.id); if (certificate) StorageAPI.selectCertificate(certificate.id); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-8 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-amber-500 sm:w-auto"><Award className="h-5 w-5" /> Lihat & Unduh Sertifikat</Link> : isPassed && reviewSubmitted ? <Link href="/certificates" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-sm font-bold text-white dark:bg-sky-400 dark:text-slate-950 sm:w-auto"><Award className="h-4 w-4" /> Cek Arsip Sertifikat</Link> : isPassed ? null : remainingAttempts > 0 ? <button onClick={handleRetake} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-sm font-bold text-white dark:bg-sky-400 dark:text-slate-950 sm:w-auto"><RefreshCw className="h-4 w-4" /> Ulangi Post-Test ({remainingAttempts} sisa)</button> : <div className="text-xs text-slate-500">Kesempatan post-test telah habis. Hubungi Admin jika memerlukan reset.</div>}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold text-slate-900 dark:text-white">Progress Jawaban</p><p className="text-[11px] text-slate-500">{answeredCount}/{questions.length} terjawab</p></div><span className="text-sm font-bold text-[#07375c] dark:text-sky-300">{answerProgress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-[#07375c] dark:bg-sky-400" style={{ width: `${answerProgress}%` }} /></div><p className="mt-3 text-[10px] text-slate-400">{saveStatus === 'saving' ? 'Menyimpan...' : saveStatus === 'saved' ? 'Jawaban tersimpan otomatis.' : saveStatus === 'local' ? 'Tersimpan di perangkat.' : 'Jawab semua soal sebelum dikirim.'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Navigator Soal</p><div className="grid grid-cols-5 gap-2">{questions.map((q, index) => { const answered = Boolean(answers[q.id]); const active = index === activeQuestion; return <button key={q.id} type="button" onClick={() => setActiveQuestion(index)} className={`aspect-square rounded-lg text-xs font-bold ${active ? 'bg-[#07375c] text-white dark:bg-sky-400 dark:text-slate-950' : answered ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{index + 1}</button>; })}</div></div>
          </aside>

          <div className="space-y-4">
            {submitError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{submitError}</div>}
            {currentQuestion && <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#07375c] text-xs font-bold text-white dark:bg-sky-400 dark:text-slate-950">{activeQuestion + 1}</span><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Soal {activeQuestion + 1} dari {questions.length}</p><h3 className="text-base font-bold leading-relaxed text-slate-900 dark:text-white sm:text-lg">{currentQuestion.question}</h3></div></div><div className="space-y-2.5">{getDisplayOptions(currentQuestion, session?.id || '').map(opt => { const isSelected = answers[currentQuestion.id] === opt.value; return <button key={opt.value} type="button" onClick={() => handleSelect(currentQuestion.id, opt.value)} className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-medium transition-all ${isSelected ? 'border-[#07375c] bg-[#07375c] text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${isSelected ? 'border-white/70 dark:border-slate-950/60' : 'border-slate-300 dark:border-slate-600'}`}>{opt.label}</span><span>{opt.text}</span></button>; })}</div></div>}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setActiveQuestion(i => Math.max(0, i - 1))} disabled={activeQuestion === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"><ArrowLeft className="h-4 w-4" /> Sebelumnya</button>{activeQuestion < questions.length - 1 ? <button type="button" onClick={() => setActiveQuestion(i => Math.min(questions.length - 1, i + 1))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-5 py-3 text-xs font-bold text-white dark:bg-sky-400 dark:text-slate-950">Berikutnya <ArrowRight className="h-4 w-4" /></button> : <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-xs font-bold text-white disabled:opacity-50 dark:bg-sky-400 dark:text-slate-950">{submitting ? 'Mengirim...' : `Kirim Post-Test (${answeredCount}/${questions.length})`} <ArrowRight className="h-4 w-4" /></button>}</div>
          </div>
        </form>
      )}
    </div>
  );
}
