'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  FlaskConical,
  Lock,
  Printer,
  RefreshCw,
  RotateCcw,
  Video,
  X
} from 'lucide-react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import {
  AdminPreviewSession,
  AdminPreviewStep,
  Certificate,
  CertificateGlobalSettings,
  CertificateSettings,
  Material,
  ParticipantQuestion,
  Question,
  TestOption,
  Training,
  UserProfile
} from '@/types';
import LearningJourney from '@/components/LearningJourney';
import TimerWidget from '@/components/TimerWidget';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';
import CertificateTemplate from '@/components/CertificateTemplate';
import { generateCertificatePDF } from '@/lib/pdf';
import { formatGoogleDriveEmbedUrl, formatVideoEmbedUrl, getMediaType } from '@/lib/mediaUtils';
import { getDisplayOptions, orderTestQuestions } from '@/lib/testSession';

type PreviewAttempt = {
  score: number;
  passed: boolean;
  submitted_at: string;
};

type PreviewData = {
  pretest: {
    answers: Record<string, TestOption>;
    submitted: boolean;
    score: number | null;
  };
  materials: {
    completed_ids: string[];
    started_at: Record<string, string>;
    current_index: number;
  };
  posttest: {
    answers: Record<string, TestOption>;
    attempts: PreviewAttempt[];
    submitted: boolean;
    score: number | null;
    passed: boolean;
  };
  review: {
    material_rating: number;
    system_rating: number;
    speaker_rating: number;
    suggestion: string;
    submitted: boolean;
  };
};

const EMPTY_PREVIEW: PreviewData = {
  pretest: { answers: {}, submitted: false, score: null },
  materials: { completed_ids: [], started_at: {}, current_index: 0 },
  posttest: { answers: {}, attempts: [], submitted: false, score: null, passed: false },
  review: { material_rating: 0, system_rating: 0, speaker_rating: 0, suggestion: '', submitted: false }
};

const CERTIFICATE_WIDTH = 1000;
const CERTIFICATE_HEIGHT = 707;

function normalizePreviewData(value: Record<string, unknown> | null | undefined): PreviewData {
  const raw = (value || {}) as Partial<PreviewData>;
  return {
    pretest: {
      ...EMPTY_PREVIEW.pretest,
      ...(raw.pretest || {}),
      answers: raw.pretest?.answers || {}
    },
    materials: {
      ...EMPTY_PREVIEW.materials,
      ...(raw.materials || {}),
      completed_ids: Array.isArray(raw.materials?.completed_ids) ? raw.materials.completed_ids : [],
      started_at: raw.materials?.started_at || {}
    },
    posttest: {
      ...EMPTY_PREVIEW.posttest,
      ...(raw.posttest || {}),
      answers: raw.posttest?.answers || {},
      attempts: Array.isArray(raw.posttest?.attempts) ? raw.posttest.attempts : []
    },
    review: {
      ...EMPTY_PREVIEW.review,
      ...(raw.review || {})
    }
  };
}

function scoreQuestions(questions: Question[], answers: Record<string, TestOption>): number {
  if (questions.length === 0) return 0;
  const correct = questions.filter(question => answers[question.id] === question.correct_answer).length;
  return Math.round((correct / questions.length) * 100);
}

export default function AdminTrainingPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const trainingId = String(params?.trainingId || '');

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [training, setTraining] = useState<Training | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pretestQuestions, setPretestQuestions] = useState<Question[]>([]);
  const [posttestQuestions, setPosttestQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<CertificateSettings | null>(null);
  const [globalSettings, setGlobalSettings] = useState<CertificateGlobalSettings | null>(null);
  const [session, setSession] = useState<AdminPreviewSession | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData>(EMPTY_PREVIEW);
  const [stage, setStage] = useState<AdminPreviewStep>('pretest');
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [timerReady, setTimerReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [previewScale, setPreviewScale] = useState(1);
  const certificateViewportRef = useRef<HTMLDivElement | null>(null);

  const loadPreview = useCallback(async () => {
    if (!trainingId) return;
    setLoading(true);
    setLoadError('');
    try {
      await initLocalStorage(true);
      const user = StorageAPI.getCurrentUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      if (user.role !== 'admin') {
        router.replace('/dashboard');
        return;
      }
      setCurrentUser(user);

      const [trainingResult, materialResult, questionResult, settingsResult, globalResult, previewSession] = await Promise.all([
        supabase.from('trainings').select('*').eq('id', trainingId).single(),
        supabase.from('materials').select('*').eq('training_id', trainingId).eq('active', true).order('order_number').order('id'),
        supabase.from('questions').select('*').eq('training_id', trainingId).eq('active', true),
        supabase.from('certificate_settings').select('*').eq('training_id', trainingId).maybeSingle(),
        supabase.from('certificate_global_settings').select('*').eq('singleton', true).maybeSingle(),
        StorageAPI.startAdminPreview(trainingId)
      ]);

      if (trainingResult.error) throw new Error(trainingResult.error.message);
      if (materialResult.error) throw new Error(materialResult.error.message);
      if (questionResult.error) throw new Error(questionResult.error.message);
      if (settingsResult.error) throw new Error(settingsResult.error.message);
      if (globalResult.error) throw new Error(globalResult.error.message);

      const tr = trainingResult.data as Training;
      const questions = (questionResult.data || []) as Question[];
      const seededPretest = orderTestQuestions(
        questions.filter(question => question.test_type === 'pretest') as ParticipantQuestion[],
        `${previewSession.id}:pretest`
      );
      const seededPosttest = orderTestQuestions(
        questions.filter(question => question.test_type === 'posttest') as ParticipantQuestion[],
        `${previewSession.id}:posttest`
      );

      const byId = new Map(questions.map(question => [question.id, question]));
      setTraining(tr);
      setMaterials((materialResult.data || []) as Material[]);
      setPretestQuestions(seededPretest.map(question => byId.get(question.id)!).filter(Boolean));
      setPosttestQuestions(seededPosttest.map(question => byId.get(question.id)!).filter(Boolean));
      setSettings((settingsResult.data as CertificateSettings | null) || null);
      setGlobalSettings((globalResult.data as CertificateGlobalSettings | null) || null);
      setSession(previewSession);
      setPreviewData(normalizePreviewData(previewSession.preview_data));
      setStage(previewSession.current_step);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Mode Uji Coba gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [router, trainingId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const persist = useCallback(async (
    nextData: PreviewData,
    nextStage: AdminPreviewStep = stage,
    nextStatus: 'in_progress' | 'completed' = 'in_progress'
  ) => {
    if (!session) return;
    setSaving(true);
    try {
      const saved = await StorageAPI.saveAdminPreview(
        session.id,
        nextData as unknown as Record<string, unknown>,
        nextStage,
        nextStatus
      );
      setSession(saved);
      setPreviewData(nextData);
      setStage(nextStage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Progress uji coba gagal disimpan.';
      await Swal.fire('Uji Coba Tidak Dapat Dilanjutkan', message, 'error');
      if (/struktur pelatihan berubah/i.test(message)) router.push('/admin/training-settings');
      throw error;
    } finally {
      setSaving(false);
    }
  }, [router, session, stage]);

  const currentMaterial = materials[Math.min(previewData.materials.current_index, Math.max(0, materials.length - 1))] || null;
  const completedMaterialIds = useMemo(() => new Set(previewData.materials.completed_ids), [previewData.materials.completed_ids]);

  useEffect(() => {
    if (stage !== 'material' || !currentMaterial || !session) return;

    const alreadyCompleted = completedMaterialIds.has(currentMaterial.id);
    if (alreadyCompleted || currentMaterial.minimum_duration_seconds <= 0) setTimerReady(true);
    else setTimerReady(false);

    if (!previewData.materials.started_at[currentMaterial.id]) {
      const nextData: PreviewData = {
        ...previewData,
        materials: {
          ...previewData.materials,
          started_at: {
            ...previewData.materials.started_at,
            [currentMaterial.id]: new Date().toISOString()
          }
        }
      };
      void persist(nextData, 'material').catch(() => undefined);
    }
  }, [completedMaterialIds, currentMaterial, persist, previewData, session, stage]);

  useEffect(() => {
    if (stage !== 'certificate') return;
    const viewport = certificateViewportRef.current;
    if (!viewport) return;

    const updateScale = () => {
      const width = Math.max(0, viewport.getBoundingClientRect().width);
      const scale = Math.min(1, width / CERTIFICATE_WIDTH);
      setPreviewScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [stage]);

  const handleReset = async () => {
    if (!training) return;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Mulai Ulang Uji Coba?',
      text: 'Jawaban, progres materi, percobaan Post-Test, dan review simulasi akan direset. Data peserta asli tidak berubah.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Reset Uji Coba',
      cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;

    try {
      setSaving(true);
      const fresh = await StorageAPI.resetAdminPreview(training.id);
      setSession(fresh);
      setPreviewData(normalizePreviewData(fresh.preview_data));
      setStage('pretest');
      setActiveQuestion(0);
      setTimerReady(false);
      await Swal.fire({ icon: 'success', title: 'Uji Coba Direset', timer: 1200, showConfirmButton: false });
    } catch (error) {
      await Swal.fire('Reset Gagal', error instanceof Error ? error.message : 'Mode Uji Coba gagal direset.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const moveToStage = async (nextStage: AdminPreviewStep, status: 'in_progress' | 'completed' = 'in_progress') => {
    setActiveQuestion(0);
    await persist(previewData, nextStage, status);
  };

  const selectAnswer = async (testType: 'pretest' | 'posttest', questionId: string, answer: TestOption) => {
    if (testType === 'pretest') {
      const nextData = {
        ...previewData,
        pretest: { ...previewData.pretest, answers: { ...previewData.pretest.answers, [questionId]: answer } }
      };
      setPreviewData(nextData);
      return;
    }
    const nextData = {
      ...previewData,
      posttest: { ...previewData.posttest, answers: { ...previewData.posttest.answers, [questionId]: answer } }
    };
    setPreviewData(nextData);
  };

  const submitTest = async (testType: 'pretest' | 'posttest') => {
    if (!training) return;
    const questions = testType === 'pretest' ? pretestQuestions : posttestQuestions;
    const answers = testType === 'pretest' ? previewData.pretest.answers : previewData.posttest.answers;
    if (questions.length === 0) return;

    if (Object.keys(answers).length < questions.length) {
      const firstMissing = questions.findIndex(question => !answers[question.id]);
      setActiveQuestion(firstMissing >= 0 ? firstMissing : 0);
      await Swal.fire('Jawaban Belum Lengkap', 'Jawab semua soal sebelum mengirim tes.', 'warning');
      return;
    }

    const score = scoreQuestions(questions, answers);
    if (testType === 'pretest') {
      const nextData: PreviewData = {
        ...previewData,
        pretest: { ...previewData.pretest, submitted: true, score }
      };
      await persist(nextData, 'pretest');
      await Swal.fire({ icon: 'success', title: 'Pre-Test Uji Coba Selesai', text: `Nilai simulasi: ${score}/100`, timer: 1600, showConfirmButton: false });
      return;
    }

    const passed = score >= training.passing_score;
    const nextAttempts = [
      ...previewData.posttest.attempts,
      { score, passed, submitted_at: new Date().toISOString() }
    ];
    const nextData: PreviewData = {
      ...previewData,
      posttest: {
        ...previewData.posttest,
        attempts: nextAttempts,
        submitted: true,
        score,
        passed
      }
    };
    await persist(nextData, 'posttest');
    await Swal.fire({
      icon: passed ? 'success' : 'warning',
      title: passed ? 'Lulus Post-Test Uji Coba' : 'Belum Lulus',
      text: `Nilai simulasi: ${score}/100 • Passing Grade: ${training.passing_score}`,
      timer: 1900,
      showConfirmButton: false
    });
  };

  const retakePosttest = async () => {
    const nextData: PreviewData = {
      ...previewData,
      posttest: {
        ...previewData.posttest,
        answers: {},
        submitted: false,
        score: null,
        passed: false
      }
    };
    setActiveQuestion(0);
    await persist(nextData, 'posttest');
  };

  const completeMaterial = async () => {
    if (!currentMaterial) return;
    if (!timerReady && currentMaterial.minimum_duration_seconds > 0) return;

    const completed = Array.from(new Set([...previewData.materials.completed_ids, currentMaterial.id]));
    const currentIndex = previewData.materials.current_index;
    const isLast = currentIndex >= materials.length - 1;
    const nextData: PreviewData = {
      ...previewData,
      materials: {
        ...previewData.materials,
        completed_ids: completed,
        current_index: isLast ? currentIndex : currentIndex + 1
      }
    };
    setTimerReady(false);
    await persist(nextData, isLast ? 'posttest' : 'material');
  };

  const goToMaterialIndex = async (index: number) => {
    if (index < 0 || index >= materials.length) return;
    const nextData: PreviewData = {
      ...previewData,
      materials: { ...previewData.materials, current_index: index }
    };
    setTimerReady(completedMaterialIds.has(materials[index].id) || materials[index].minimum_duration_seconds <= 0);
    await persist(nextData, 'material');
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    const review = previewData.review;
    if (review.material_rating < 1 || review.system_rating < 1 || review.speaker_rating < 1) {
      await Swal.fire('Review Belum Lengkap', 'Berikan nilai 1–5 untuk seluruh aspek review.', 'warning');
      return;
    }

    const nextData: PreviewData = {
      ...previewData,
      review: { ...review, submitted: true }
    };
    await persist(nextData, 'certificate', 'completed');
    await Swal.fire({
      icon: 'success',
      title: 'Alur Uji Coba Selesai',
      text: 'Anda sekarang melihat sertifikat simulasi. Data ini tidak masuk ke arsip peserta.',
      timer: 1800,
      showConfirmButton: false
    });
  };

  const previewCertificate = useMemo<Certificate | null>(() => {
    if (!training || !currentUser || stage !== 'certificate') return null;
    const score = previewData.posttest.score ?? 0;
    return {
      id: session?.id || 'preview',
      user_id: null,
      training_id: training.id,
      certificate_number: settings?.numbering_enabled ? 'PREVIEW' : null,
      verification_code: 'PREVIEW-NOT-VALID',
      issued_at: new Date().toISOString(),
      posttest_score: score,
      user_name: `${currentUser.full_name} (Uji Coba)`,
      user_institution: currentUser.institution || 'RSUD Prof. Dr. W.Z. Johannes Kupang',
      training_title: training.title,
      training_jpl: training.jpl,
      training_start_date: training.start_date,
      training_end_date: training.end_date,
      show_posttest_score: settings?.show_posttest_score ?? true,
      signatory_name: globalSettings?.signatory_name || settings?.signatory_name,
      signatory_title: globalSettings?.signatory_title || settings?.signatory_title,
      signatory_image_url: globalSettings?.signatory_image_url || settings?.signatory_image_url,
      stamp_image_url: globalSettings?.stamp_image_url || settings?.stamp_image_url
    };
  }, [currentUser, globalSettings, previewData.posttest.score, session?.id, settings, stage, training]);

  const previewCertificateSettings = useMemo<CertificateSettings | undefined>(() => {
    if (!training) return undefined;
    const base = settings || {
      id: 'preview',
      training_id: training.id,
      certificate_enabled: false,
      numbering_enabled: false,
      number_format: '',
      start_number: 1,
      number_digits: 4,
      current_number: 1,
      show_posttest_score: true,
      signatory_name: 'Nama Direktur',
      signatory_title: 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
      updated_at: new Date().toISOString()
    };
    return {
      ...base,
      signatory_name: globalSettings?.signatory_name || base.signatory_name,
      signatory_title: globalSettings?.signatory_title || base.signatory_title,
      signatory_image_url: globalSettings?.signatory_image_url || base.signatory_image_url,
      stamp_image_url: globalSettings?.stamp_image_url || base.stamp_image_url
    };
  }, [globalSettings, settings, training]);

  const handleDownloadPreviewCertificate = async () => {
    if (!previewCertificate) return;
    setSaving(true);
    try {
      await generateCertificatePDF('certificate-render-target', `Uji_Coba_Sertifikat_${training?.title.replace(/\s+/g, '_') || 'LONTAR'}.pdf`);
    } catch (error) {
      await Swal.fire('Unduh Gagal', error instanceof Error ? error.message : 'PDF uji coba gagal dibuat.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const activeJourneyStage = stage === 'review' ? 'posttest' : stage;

  if (loading) {
    return <div className="mx-auto max-w-md py-20 text-center"><LontarLoadingSpinner size="lg" text="Menyiapkan Mode Uji Coba..." /></div>;
  }

  if (loadError || !training || !currentUser || !session) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <div className="space-y-4 rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900 dark:bg-slate-900">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="text-lg font-bold">Mode Uji Coba Tidak Dapat Dibuka</h1>
          <p className="text-xs text-slate-500">{loadError || 'Data pelatihan tidak tersedia.'}</p>
          <button onClick={() => router.push('/admin/training-settings')} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">Kembali ke Pengaturan Pelatihan</button>
        </div>
      </div>
    );
  }

  const renderTestStage = (testType: 'pretest' | 'posttest') => {
    const questions = testType === 'pretest' ? pretestQuestions : posttestQuestions;
    const state = testType === 'pretest' ? previewData.pretest : previewData.posttest;
    const answers = state.answers;
    const submitted = state.submitted;
    const currentQuestion = questions[activeQuestion];
    const answeredCount = Object.keys(answers).length;
    const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
    const title = testType === 'pretest' ? 'Pre-Test Pelatihan' : 'Post-Test Pelatihan';

    if (questions.length === 0) {
      return (
        <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40">
          <AlertCircle className="mx-auto h-9 w-9 text-amber-500" />
          <h2 className="font-bold">{testType === 'pretest' ? 'Pre-Test' : 'Post-Test'} Belum Tersedia</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">Tambahkan soal aktif terlebih dahulu. Checklist kesiapan akan tetap menandai bagian ini belum lengkap.</p>
          <button onClick={() => router.push('/admin/questions')} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">Kelola Soal</button>
        </div>
      );
    }

    if (submitted) {
      const postPassed = testType === 'posttest' ? previewData.posttest.passed : true;
      const remainingAttempts = testType === 'posttest'
        ? Math.max(0, training.max_posttest_attempts - previewData.posttest.attempts.length)
        : 0;
      return (
        <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${postPassed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/50'}`}>
            {postPassed ? <CheckCircle2 className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Hasil Simulasi</p>
            <h2 className="mt-1 text-2xl font-bold">{title}</h2>
            <p className="mt-2 text-4xl font-black text-[#07375c] dark:text-sky-300">{state.score ?? 0}</p>
            {testType === 'posttest' && <p className="mt-1 text-xs text-slate-500">Passing Grade {training.passing_score} • Percobaan {previewData.posttest.attempts.length}/{training.max_posttest_attempts}</p>}
          </div>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            {testType === 'pretest' ? (
              <button onClick={() => void moveToStage('material')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-sm font-bold text-white dark:bg-sky-400 dark:text-slate-950">Lanjut ke Materi <ArrowRight className="h-4 w-4" /></button>
            ) : postPassed ? (
              <button onClick={() => void moveToStage('review')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-sm font-bold text-white dark:bg-sky-400 dark:text-slate-950">Lanjut ke Review <ArrowRight className="h-4 w-4" /></button>
            ) : remainingAttempts > 0 ? (
              <button onClick={() => void retakePosttest()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-sm font-bold text-white dark:bg-sky-400 dark:text-slate-950"><RefreshCw className="h-4 w-4" /> Ulangi Post-Test ({remainingAttempts} sisa)</button>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-300">Batas percobaan simulasi sudah habis. Gunakan Reset Uji Coba untuk memulai dari awal.</p>
            )}
          </div>
        </div>
      );
    }

    return (
      <form onSubmit={(event) => { event.preventDefault(); void submitTest(testType); }} className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-xs font-bold">Progress Jawaban</p><p className="text-[11px] text-slate-500">{answeredCount}/{questions.length} terjawab</p></div>
              <span className="text-sm font-bold text-[#07375c] dark:text-sky-300">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-[#07375c] dark:bg-sky-400" style={{ width: `${progress}%` }} /></div>
            <p className="mt-3 text-[10px] text-slate-400">Jawaban disimpan pada sesi uji coba, bukan hasil peserta.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Navigator Soal</p>
            <div className="grid grid-cols-5 gap-2">
              {questions.map((question, index) => {
                const answered = Boolean(answers[question.id]);
                const active = activeQuestion === index;
                return <button key={question.id} type="button" onClick={() => setActiveQuestion(index)} className={`aspect-square rounded-lg text-xs font-bold transition-all ${active ? 'bg-[#07375c] text-white dark:bg-sky-400 dark:text-slate-950' : answered ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{index + 1}</button>;
              })}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#07375c] dark:text-sky-300">{testType === 'pretest' ? 'Tahap 1 • Evaluasi Awal' : 'Tahap 3 • Evaluasi Akhir'}</span>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">{title}</h1>
            {testType === 'posttest' && <p className="mt-1 text-xs text-slate-500">Passing Grade {training.passing_score} • Maksimal {training.max_posttest_attempts} percobaan</p>}
          </div>

          {currentQuestion && (
            <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#07375c] text-xs font-bold text-white dark:bg-sky-400 dark:text-slate-950">{activeQuestion + 1}</span>
                <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Soal {activeQuestion + 1} dari {questions.length}</p><h3 className="text-base font-bold leading-relaxed sm:text-lg">{currentQuestion.question}</h3></div>
              </div>
              <div className="space-y-2.5">
                {getDisplayOptions(currentQuestion as ParticipantQuestion, `${session.id}:${testType}`).map(option => {
                  const selected = answers[currentQuestion.id] === option.value;
                  return (
                    <button key={option.value} type="button" onClick={() => void selectAnswer(testType, currentQuestion.id, option.value)} className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-medium transition-all ${selected ? 'border-[#07375c] bg-[#07375c] text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950' : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200'}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${selected ? 'border-white/70 dark:border-slate-950/60' : 'border-slate-300 dark:border-slate-600'}`}>{option.label}</span>
                      <span>{option.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setActiveQuestion(index => Math.max(0, index - 1))} disabled={activeQuestion === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"><ArrowLeft className="h-4 w-4" /> Sebelumnya</button>
            {activeQuestion < questions.length - 1 ? (
              <button type="button" onClick={() => setActiveQuestion(index => Math.min(questions.length - 1, index + 1))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-5 py-3 text-xs font-bold text-white dark:bg-sky-400 dark:text-slate-950">Berikutnya <ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#07375c] px-6 py-3 text-xs font-bold text-white disabled:opacity-50 dark:bg-sky-400 dark:text-slate-950">Kirim {testType === 'pretest' ? 'Pre-Test' : 'Post-Test'} ({answeredCount}/{questions.length}) <ArrowRight className="h-4 w-4" /></button>
            )}
          </div>
        </div>
      </form>
    );
  };

  const renderMaterialStage = () => {
    if (!currentMaterial || materials.length === 0) {
      return (
        <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40">
          <BookOpen className="mx-auto h-9 w-9 text-amber-500" />
          <h2 className="font-bold">Materi Belum Tersedia</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">Tambahkan minimal satu materi aktif agar alur peserta dapat diuji secara lengkap.</p>
          <button onClick={() => router.push('/admin/materials')} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900">Kelola Materi</button>
        </div>
      );
    }

    const index = previewData.materials.current_index;
    const mediaType = currentMaterial.content_url ? getMediaType(currentMaterial.content_url) : null;
    const embedUrl = currentMaterial.content_url
      ? (mediaType === 'pdf' ? formatGoogleDriveEmbedUrl(currentMaterial.content_url) : formatVideoEmbedUrl(currentMaterial.content_url))
      : '';
    const startedAt = previewData.materials.started_at[currentMaterial.id] || new Date().toISOString();
    const completedCount = materials.filter(material => completedMaterialIds.has(material.id)).length;
    const materialProgress = materials.length ? Math.round((completedCount / materials.length) * 100) : 0;

    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="min-w-0 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="space-y-3 border-b border-slate-100 pb-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#07375c]/10 px-3 py-1 text-xs font-bold text-[#07375c] dark:bg-sky-400/10 dark:text-sky-300"><BookOpen className="h-3.5 w-3.5" /> Materi {index + 1}</span>
              <span className="text-[11px] font-medium text-slate-400">Minimal baca {currentMaterial.minimum_duration_seconds} detik</span>
            </div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{currentMaterial.title}</h1>
            {currentMaterial.description && <p className="text-sm leading-relaxed text-slate-500">{currentMaterial.description}</p>}
          </div>

          {currentMaterial.content_url && mediaType && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {mediaType === 'pdf' ? <FileText className="h-4 w-4 text-red-500" /> : <Video className="h-4 w-4 text-amber-500" />}
                <span>{mediaType === 'pdf' ? 'Dokumen Pembelajaran' : 'Video Pembelajaran'}</span>
              </div>
              {mediaType === 'pdf' ? (
                <div className="h-[62vh] min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-900 dark:border-slate-800"><iframe src={embedUrl} title={currentMaterial.title} className="h-full w-full border-0" allow="autoplay" /></div>
              ) : (
                <div className="aspect-video overflow-hidden rounded-xl border border-slate-800 bg-slate-950"><iframe src={embedUrl} title={currentMaterial.title} className="h-full w-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>
              )}
            </div>
          )}

          {currentMaterial.content && <div className="whitespace-pre-line text-sm leading-7 text-slate-800 dark:text-slate-200 sm:text-base">{currentMaterial.content}</div>}

          <TimerWidget
            minimumDurationSeconds={currentMaterial.minimum_duration_seconds}
            startedAtIso={startedAt}
            onComplete={() => setTimerReady(true)}
            isAlreadyCompleted={completedMaterialIds.has(currentMaterial.id)}
          />

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:justify-between">
            <button type="button" onClick={() => void goToMaterialIndex(index - 1)} disabled={index === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"><ArrowLeft className="h-4 w-4" /> Sebelumnya</button>
            <button type="button" onClick={() => void completeMaterial()} disabled={(!timerReady && currentMaterial.minimum_duration_seconds > 0) || saving} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold ${timerReady || currentMaterial.minimum_duration_seconds <= 0 ? 'bg-[#07375c] text-white dark:bg-sky-400 dark:text-slate-950' : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800'}`}>
              {timerReady || currentMaterial.minimum_duration_seconds <= 0 ? <>Selesai & {index === materials.length - 1 ? 'Ke Post-Test' : 'Berikutnya'} <ArrowRight className="h-4 w-4" /></> : <><Lock className="h-4 w-4" /> Tunggu waktu baca</>}
            </button>
          </div>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-bold">Progres Materi</p><p className="text-[11px] text-slate-500">{completedCount} dari {materials.length} selesai</p></div><span className="text-sm font-bold text-[#07375c] dark:text-sky-300">{materialProgress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-[#07375c] dark:bg-sky-400" style={{ width: `${materialProgress}%` }} /></div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Daftar Materi</p>
            <div className="space-y-1">
              {materials.map((material, materialIndex) => {
                const done = completedMaterialIds.has(material.id);
                const active = materialIndex === index;
                const unlocked = materialIndex === 0 || completedMaterialIds.has(materials[materialIndex - 1]?.id);
                return (
                  <button key={material.id} type="button" disabled={!unlocked && !done && !active} onClick={() => void goToMaterialIndex(materialIndex)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed ${active ? 'border-[#07375c]/20 bg-[#07375c]/5 text-[#07375c] dark:text-sky-300' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : unlocked ? 'border-transparent text-slate-600 dark:text-slate-400' : 'border-transparent text-slate-300 dark:text-slate-600'}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-[#07375c] text-white dark:bg-sky-400 dark:text-slate-950' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : unlocked ? materialIndex + 1 : <Lock className="h-3 w-3" />}</span>
                    <span className="line-clamp-2">{material.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    );
  };

  const renderReviewStage = () => (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#07375c] dark:text-sky-300">Tahap 4 • Evaluasi Pelatihan</span>
        <h1 className="mt-1 text-xl font-bold sm:text-2xl">Review Pelatihan</h1>
        <p className="mt-1 text-xs text-slate-500">Form ini disimulasikan seperti peserta, tetapi tidak disimpan ke data review produksi.</p>
      </div>
      <form onSubmit={submitReview} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        {([
          ['material_rating', 'Bagaimana penilaian Anda terhadap materi pelatihan?'],
          ['system_rating', 'Bagaimana penilaian Anda terhadap kemudahan penggunaan LONTAR?'],
          ['speaker_rating', 'Bagaimana penilaian Anda terhadap penyampaian narasumber/pemateri?']
        ] as const).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <p className="text-sm font-semibold">{label}</p>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map(value => (
                <button key={value} type="button" onClick={() => setPreviewData(current => ({ ...current, review: { ...current.review, [key]: value } }))} className={`rounded-xl border px-2 py-2.5 text-xs font-bold ${previewData.review[key] === value ? 'border-[#07375c] bg-[#07375c] text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'}`}>{value}</button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400"><span>Sangat Kurang</span><span>Sangat Baik</span></div>
          </div>
        ))}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Saran atau masukan</p>
          <textarea rows={4} maxLength={1000} value={previewData.review.suggestion} onChange={event => setPreviewData(current => ({ ...current, review: { ...current.review, suggestion: event.target.value } }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Tuliskan saran atau masukan..." />
        </div>
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-[#07375c] px-6 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-sky-400 dark:text-slate-950">Kirim Review & Lihat Sertifikat</button>
      </form>
    </div>
  );

  const renderCertificateStage = () => {
    if (!previewCertificate) return null;
    return (
      <div className="certificate-page mx-auto w-full max-w-[1040px] space-y-4 overflow-x-hidden">
        <div className="certificate-screen-actions rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div><p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Alur Uji Coba Selesai</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Checklist kesiapan kini mencatat uji coba versi {session.structure_version} telah selesai. Sertifikat di bawah hanya simulasi dan tidak masuk arsip.</p></div>
          </div>
        </div>

        {!settings?.certificate_enabled && (
          <div className="certificate-screen-actions rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Sertifikat pelatihan belum diaktifkan. Preview tetap ditampilkan untuk membantu pengecekan desain.</div>
        )}

        <div className="certificate-screen-actions flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div><span className="text-xs font-semibold text-amber-600">PREVIEW SERTIFIKAT</span><h1 className="text-xl font-bold">Sertifikat Uji Coba</h1><p className="text-xs text-slate-500">Nomor resmi tidak digunakan dan QR tidak dapat diverifikasi.</p></div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void handleDownloadPreviewCertificate()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Download className="h-4 w-4" /> Unduh PDF</button>
            <button onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold dark:bg-slate-800"><Printer className="h-4 w-4" /> Cetak</button>
          </div>
        </div>

        <div className="certificate-print-area w-full overflow-hidden rounded-2xl border border-slate-300 bg-slate-200/50 p-1 dark:border-slate-800 dark:bg-slate-950 sm:p-2">
          <div ref={certificateViewportRef} className="certificate-preview-viewport mx-auto w-full max-w-[1000px] overflow-hidden">
            <div className="certificate-preview-stage relative mx-auto overflow-hidden" style={{ width: `${CERTIFICATE_WIDTH * previewScale}px`, height: `${CERTIFICATE_HEIGHT * previewScale}px` }}>
              <div className="certificate-preview-scale absolute left-0 top-0" style={{ width: `${CERTIFICATE_WIDTH}px`, height: `${CERTIFICATE_HEIGHT}px`, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                <CertificateTemplate certificate={previewCertificate} settings={previewCertificateSettings} previewMode />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="certificate-screen-actions sticky top-2 z-40 rounded-2xl border border-violet-200 bg-violet-50/95 p-3 shadow-lg backdrop-blur dark:border-violet-900 dark:bg-violet-950/90 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><FlaskConical className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-700 dark:text-violet-300">MODE UJI COBA ADMIN</p>
              <h1 className="truncate text-sm font-bold sm:text-base">{training.title}</h1>
              <p className="text-[11px] text-violet-700/80 dark:text-violet-300/80">Pengalaman peserta disimulasikan. Tidak memengaruhi peserta, statistik, attempt, review, atau sertifikat resmi.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button onClick={() => void handleReset()} disabled={saving} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200"><RotateCcw className="h-4 w-4" /> Reset</button>
            <button onClick={() => router.push('/admin/training-settings')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white"><X className="h-4 w-4" /> Keluar</button>
          </div>
        </div>
      </div>

      {stage !== 'certificate' && (
        <LearningJourney
          activeStage={activeJourneyStage}
          completed={{
            pretest: previewData.pretest.submitted,
            material: materials.length > 0 && previewData.materials.completed_ids.length >= materials.length,
            posttest: previewData.posttest.passed,
            certificate: session.status === 'completed'
          }}
        />
      )}

      {stage === 'pretest' && renderTestStage('pretest')}
      {stage === 'material' && renderMaterialStage()}
      {stage === 'posttest' && renderTestStage('posttest')}
      {stage === 'review' && renderReviewStage()}
      {stage === 'certificate' && renderCertificateStage()}
    </div>
  );
}
