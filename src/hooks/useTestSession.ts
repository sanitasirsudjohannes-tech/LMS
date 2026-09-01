'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { StorageAPI } from '@/lib/storage';
import { SubmittedTestResult, TestOption, TestSession } from '@/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'local';

export function useTestSession() {
  const [session, setSession] = useState<TestSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, TestOption>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialize = useCallback(async (
    trainingId: string,
    testType: 'pretest' | 'posttest'
  ) => {
    const activeSession = await StorageAPI.startTestSession(trainingId, testType);
    const recovered = StorageAPI.getRecoveredTestAnswers(activeSession);
    setSession(activeSession);
    setAnswers(recovered);
    setSaveStatus(Object.keys(recovered).length > 0 ? 'saved' : 'idle');
    return activeSession;
  }, []);

  const selectAnswer = useCallback((questionId: string, option: TestOption) => {
    setSaveStatus('saving');
    setAnswers(previous => {
      const next = { ...previous, [questionId]: option };
      if (session) StorageAPI.saveTestAnswersLocally(session, next);
      return next;
    });
  }, [session]);

  useEffect(() => {
    if (!session || Object.keys(answers).length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void StorageAPI.saveTestSession(session.id, answers)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('local'));
    }, 700);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [answers, session]);

  useEffect(() => {
    if (!session) return;
    const syncWhenOnline = () => {
      setSaveStatus('saving');
      void StorageAPI.saveTestSession(session.id, answers)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('local'));
    };
    window.addEventListener('online', syncWhenOnline);
    return () => window.removeEventListener('online', syncWhenOnline);
  }, [answers, session]);

  const submit = useCallback(async (): Promise<SubmittedTestResult> => {
    if (!session) throw new Error('Sesi tes belum tersedia. Muat ulang halaman lalu coba kembali.');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const result = await StorageAPI.submitTestSession(session, answers);
    setSaveStatus('saved');
    return result;
  }, [answers, session]);

  const beginNewAttempt = useCallback(async () => {
    if (!session) throw new Error('Sesi tes tidak ditemukan.');
    setSession(null);
    setAnswers({});
    setSaveStatus('idle');
    return initialize(session.training_id, session.test_type);
  }, [initialize, session]);

  return { session, answers, saveStatus, initialize, selectAnswer, submit, beginNewAttempt };
}
