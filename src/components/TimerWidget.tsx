'use client';

import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, Lock } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

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
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(isAlreadyCompleted);

  useEffect(() => {
    if (isAlreadyCompleted || minimumDurationSeconds <= 0) {
      setIsCompleted(true);
      setRemainingSeconds(0);
      return;
    }

    const startTime = new Date(startedAtIso).getTime();

    const checkTime = () => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, minimumDurationSeconds - elapsedSeconds);
      setRemainingSeconds(remaining);

      if (remaining === 0) {
        setIsCompleted(true);
        onComplete();
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 1000);

    return () => clearInterval(interval);
  }, [minimumDurationSeconds, startedAtIso, isAlreadyCompleted, onComplete]);

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
                : `Sisa waktu: ${formatDuration(remainingSeconds)}`}
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
