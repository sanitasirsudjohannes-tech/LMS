'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, LockKeyhole, Save, Unlock } from 'lucide-react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { Training } from '@/types';

function formatWitaDateTimeInput(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function witaInputToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

function formatWitaDisplay(iso?: string | null): string {
  if (!iso) return 'Langsung terbuka setelah seluruh materi selesai';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) + ' WITA';
}

export default function PosttestSettingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainingId, setTrainingId] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedTraining = useMemo(
    () => trainings.find(training => training.id === trainingId) || null,
    [trainings, trainingId]
  );

  const applyTraining = (training: Training | null) => {
    if (!training) {
      setScheduled(false);
      setStartAt('');
      return;
    }
    const hasSchedule = Boolean(training.posttest_start_at);
    setScheduled(hasSchedule);
    setStartAt(formatWitaDateTimeInput(training.posttest_start_at));
  };

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage(true);
        const list = StorageAPI.getTrainings();
        setTrainings(list);
        const current = StorageAPI.getTraining();
        const initial = list.find(item => item.id === current?.id) || list[0] || null;
        if (initial) {
          setTrainingId(initial.id);
          applyTraining(initial);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pengaturan Post-Test gagal dimuat.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleTrainingChange = (id: string) => {
    setTrainingId(id);
    applyTraining(trainings.find(training => training.id === id) || null);
    setError('');
    setSuccess('');
  };

  const handleSave = async () => {
    if (!selectedTraining) return;
    setError('');
    setSuccess('');

    if (scheduled && !startAt) {
      setError('Pilih tanggal dan jam mulai Post-Test terlebih dahulu.');
      return;
    }

    let posttestStartAt: string | null = null;
    if (scheduled) {
      posttestStartAt = witaInputToIso(startAt);
      const scheduleMs = new Date(posttestStartAt).getTime();
      const trainingStartMs = selectedTraining.start_date ? new Date(selectedTraining.start_date).getTime() : Number.NEGATIVE_INFINITY;
      const trainingEndMs = selectedTraining.end_date ? new Date(selectedTraining.end_date).getTime() : Number.POSITIVE_INFINITY;
      if (scheduleMs < trainingStartMs || scheduleMs > trainingEndMs) {
        setError('Waktu mulai Post-Test harus berada di dalam periode pelatihan.');
        return;
      }
    }

    setSaving(true);
    try {
      const { data, error: updateError } = await supabase
        .from('trainings')
        .update({ posttest_start_at: posttestStartAt })
        .eq('id', selectedTraining.id)
        .select('*')
        .single();

      if (updateError) {
        if (updateError.message.toLowerCase().includes('posttest_start_at')) {
          throw new Error('Fitur jadwal Post-Test belum tersedia pada database. Pastikan seluruh pembaruan SQL LONTAR yang diwajibkan sudah diterapkan.');
        }
        throw new Error(updateError.message);
      }

      const updated = data as Training;
      setTrainings(previous => previous.map(item => item.id === updated.id ? updated : item));
      // Segarkan cache global dari server agar dashboard/Post-Test tidak membaca jadwal lama.
      await initLocalStorage(true);
      StorageAPI.setSelectTraining(updated.id);
      setScheduled(Boolean(updated.posttest_start_at));
      setStartAt(formatWitaDateTimeInput(updated.posttest_start_at));
      setSuccess(updated.posttest_start_at
        ? `Post-Test ditahan sampai ${formatWitaDisplay(updated.posttest_start_at)}.`
        : 'Post-Test akan terbuka segera setelah peserta menyelesaikan seluruh materi.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jadwal Post-Test gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-500">Memuat pengaturan Post-Test...</div>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <Clock3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Jadwal Mulai Post-Test</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">Admin dapat membuka Post-Test langsung setelah materi selesai atau menahannya sampai tanggal dan jam tertentu. Sebelum waktu tersebut peserta tidak dapat memulai maupun mengirim Post-Test.</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Pelatihan</label>
          <select
            value={trainingId}
            onChange={event => handleTrainingChange(event.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
          >
            {trainings.map(training => <option key={training.id} value={training.id}>{training.title}</option>)}
          </select>
        </div>

        {selectedTraining ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setScheduled(false)}
                className={`p-4 rounded-xl border text-left transition-all ${!scheduled ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <div className="flex items-center gap-3">
                  <Unlock className="w-5 h-5 text-emerald-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Buka otomatis setelah materi selesai</div>
                    <div className="text-xs text-slate-500 mt-0.5">Tidak ada penahanan waktu tambahan.</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScheduled(true)}
                className={`p-4 rounded-xl border text-left transition-all ${scheduled ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <div className="flex items-center gap-3">
                  <LockKeyhole className="w-5 h-5 text-amber-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Tahan sampai waktu tertentu</div>
                    <div className="text-xs text-slate-500 mt-0.5">Post-Test baru muncul dan dapat dibuka setelah jadwal tercapai.</div>
                  </div>
                </div>
              </button>
            </div>

            {scheduled && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Tanggal & Jam Mulai (WITA)</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={event => setStartAt(event.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">Periode pelatihan: {new Date(selectedTraining.start_date).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' })} s.d. {new Date(selectedTraining.end_date).toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar' })}.</p>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-4 text-xs text-slate-600 dark:text-slate-300">
              <strong>Status saat ini:</strong> {scheduled && startAt ? `Ditahan sampai ${formatWitaDisplay(witaInputToIso(startAt))}` : 'Terbuka setelah seluruh materi selesai'}.
            </div>

            {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-300">{error}</div>}
            {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 p-3 text-xs text-emerald-700 dark:text-emerald-300">{success}</div>}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-500">Belum ada pelatihan yang dapat diatur.</div>
        )}
      </div>
    </div>
  );
}
