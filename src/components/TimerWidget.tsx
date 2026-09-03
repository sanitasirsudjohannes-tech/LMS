'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Clock, CheckCircle2, Lock } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface TimerWidgetProps {
  minimumDurationSeconds: number;
  startedAtIso: string;
  onComplete: () => void;
  isAlreadyCompleted?: boolean;
}

export default function TimerWidget({
  minimumDurationSeconds,
  startedAtIso,
  onComplete,
  isAlreadyCompleted = false
}: TimerWidgetProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(Math.max(0, minimumDurationSeconds));
  const [isCompleted, setIsCompleted] = useState<boolean>(isAlreadyCompleted);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockReady, setClockReady] = useState(isAlreadyCompleted || minimumDurationSeconds <= 0);
  const completionNotifiedRef = useRef(isAlreadyCompleted);

  useEffect(() => {
    setIsCompleted(isAlreadyCompleted);
    completionNotifiedRef.current = isAlreadyCompleted;
  }, [isAlreadyCompleted, startedAtIso]);

  useEffect(() => {
    if (isAlreadyCompleted || minimumDurationSeconds <= 0) {
      setClockReady(true);
      return;
    }

    let cancelled = false;

    const syncServerClock = async () => {
      const requestStartedAt = Date.now();
      try {
        const { data, error } = await supabase.rpc('lms_server_now');
        if (error) throw error;

        const responseReceivedAt = Date.now();
        const serverNowMs = new Date(String(data)).getTime();
        if (!Number.isFinite(serverNowMs)) throw new Error('Waktu server tidak valid');

        // Gunakan titik tengah request untuk mengurangi pengaruh latensi jaringan.
        const localMidpointMs = requestStartedAt + (responseReceivedAt - requestStartedAt) / 2;
        if (!cancelled) setServerOffsetMs(serverNowMs - localMidpointMs);
      } catch {
        // Fallback kompatibel sebelum migrasi SQL timer dijalankan. Backend tetap
        // memvalidasi durasi memakai waktu server saat materi diselesaikan.
        if (!cancelled) setServerOffsetMs(0);
      } finally {
        if (!cancelled) setClockReady(true);
      }
    };

    void syncServerClock();
    return () => { cancelled = true; };
  }, [isAlreadyCompleted, minimumDurationSeconds, startedAtIso]);

  useEffect(() => {
    if (isAlreadyCompleted || minimumDurationSeconds <= 0 || !clockReady) return;

    const startTime = new Date(startedAtIso).getTime();
    if (!Number.isFinite(startTime)) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const checkTime = () => {
      const serverNowEstimate = Date.now() + serverOffsetMs;
      const elapsedSeconds = Math.max(0, Math.floor((serverNowEstimate - startTime) / 1000));
      const remaining = Math.max(0, minimumDurationSeconds - elapsedSeconds);
      setRemainingSeconds(remaining);

      if (remaining === 0) {
        setIsCompleted(true);
        if (!completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onComplete();
        }
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    checkTime();
    if (!completionNotifiedRef.current) interval = setInterval(checkTime, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [minimumDurationSeconds, startedAtIso, isAlreadyCompleted, onComplete, clockReady, serverOffsetMs]);

  if (minimumDurationSeconds <= 0) return null;

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      isCompleted
        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
        : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">
              Durasi Minimum Materi
            </p>
            <p className="text-sm font-bold">
              {isCompleted
                ? 'Waktu membaca minimum terpenuhi ✓'
                : clockReady
                  ? `Sisa waktu: ${formatDuration(remainingSeconds)}`
                  : 'Menyinkronkan waktu...'}
            </p>
          </div>
        </div>

        <div>
          {isCompleted ? (
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 rounded-lg">
              Siap Diselesaikan
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-lg flex items-center gap-1">
              <Lock className="w-3 h-3" /> Membaca...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
