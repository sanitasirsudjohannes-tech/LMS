'use client';

import React from 'react';
import { Award, BookOpen, Check, FileCheck2, GraduationCap, Lock } from 'lucide-react';

type Stage = 'pretest' | 'material' | 'posttest' | 'certificate';

type Props = {
  activeStage: Stage;
  completed?: Partial<Record<Stage, boolean>>;
  compact?: boolean;
};

const stages = [
  { id: 'pretest' as const, label: 'Pre-Test', icon: FileCheck2 },
  { id: 'material' as const, label: 'Materi', icon: BookOpen },
  { id: 'posttest' as const, label: 'Post-Test', icon: GraduationCap },
  { id: 'certificate' as const, label: 'Sertifikat', icon: Award },
];

export default function LearningJourney({ activeStage, completed = {}, compact = false }: Props) {
  const activeIndex = stages.findIndex(stage => stage.id === activeStage);

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Alur Pembelajaran</p>
          {!compact && <p className="mt-0.5 text-xs text-slate-500">Ikuti setiap tahap secara berurutan sampai sertifikat tersedia.</p>}
        </div>
        <span className="rounded-full bg-[#07375c]/10 px-2.5 py-1 text-[10px] font-bold text-[#07375c] dark:bg-sky-400/10 dark:text-sky-300">
          Tahap {activeIndex + 1}/4
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {stages.map((stage, index) => {
          const done = Boolean(completed[stage.id]);
          const active = stage.id === activeStage;
          const unlocked = done || active || index <= activeIndex;
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="relative min-w-0">
              {index < stages.length - 1 && (
                <div className={`absolute left-[58%] right-[-42%] top-4 h-px sm:top-5 ${index < activeIndex || done ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
              <div className="relative z-10 flex flex-col items-center gap-1.5 text-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full border sm:h-10 sm:w-10 ${
                  done
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : active
                      ? 'border-[#07375c] bg-[#07375c] text-white shadow-sm dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950'
                      : unlocked
                        ? 'border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                        : 'border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-600'
                }`}>
                  {done ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : unlocked ? <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                </div>
                <span className={`truncate text-[9px] font-semibold sm:text-[10px] ${active ? 'text-[#07375c] dark:text-sky-300' : done ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>{stage.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
