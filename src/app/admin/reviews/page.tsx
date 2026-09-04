'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';

interface ReviewRow {
  id: string;
  training_id: string;
  user_id: string;
  material_rating: number;
  material_ease_rating: number;
  relevance_rating: number;
  speaker_rating: number;
  suggestion: string | null;
  created_at: string;
}

interface ProfileRow { id: string; full_name: string; email: string; }
interface TrainingRow { id: string; title: string; }

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [trainings, setTrainings] = useState<Record<string, TrainingRow>>({});
  const [trainingFilter, setTrainingFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [{ data: reviewData, error: reviewError }, { data: profileData, error: profileError }, { data: trainingData, error: trainingError }] = await Promise.all([
          supabase.from('training_reviews').select('id,training_id,user_id,material_rating,material_ease_rating,relevance_rating,speaker_rating,suggestion,created_at').order('created_at', { ascending: false }),
          supabase.from('profiles').select('id,full_name,email'),
          supabase.from('trainings').select('id,title').order('title')
        ]);
        if (reviewError) throw reviewError;
        if (profileError) throw profileError;
        if (trainingError) throw trainingError;
        setReviews((reviewData || []) as ReviewRow[]);
        setProfiles(Object.fromEntries(((profileData || []) as ProfileRow[]).map(row => [row.id, row])));
        setTrainings(Object.fromEntries(((trainingData || []) as TrainingRow[]).map(row => [row.id, row])));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Rekap review gagal dimuat.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => trainingFilter === 'all' ? reviews : reviews.filter(row => row.training_id === trainingFilter), [reviews, trainingFilter]);
  const averages = useMemo(() => {
    if (!filtered.length) return { material: 0, ease: 0, relevance: 0, speaker: 0, overall: 0 };
    const avg = (key: keyof Pick<ReviewRow, 'material_rating' | 'material_ease_rating' | 'relevance_rating' | 'speaker_rating'>) => filtered.reduce((sum, row) => sum + row[key], 0) / filtered.length;
    const material = avg('material_rating');
    const ease = avg('material_ease_rating');
    const relevance = avg('relevance_rating');
    const speaker = avg('speaker_rating');
    return { material, ease, relevance, speaker, overall: (material + ease + relevance + speaker) / 4 };
  }, [filtered]);

  if (loading) return <div className="py-16 text-center"><LontarLoadingSpinner size="lg" text="Memuat review pelatihan..." /></div>;
  if (error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Evaluasi Peserta</p>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Review Pelatihan</h2>
          <p className="text-xs text-slate-500 mt-1">Rekap penilaian dan saran peserta setelah lulus Post-Test.</p>
        </div>
        <select value={trainingFilter} onChange={e => setTrainingFilter(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
          <option value="all">Semua Pelatihan</option>
          {Object.values(trainings).map(training => <option key={training.id} value={training.id}>{training.title}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Jumlah Review', filtered.length.toString()],
          ['Materi', averages.material.toFixed(2)],
          ['Kemudahan', averages.ease.toFixed(2)],
          ['Relevansi', averages.relevance.toFixed(2)],
          ['Narasumber', averages.speaker.toFixed(2)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Belum ada review untuk pilihan ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-500">
                <tr><th className="text-left p-3">Peserta</th><th className="text-left p-3">Pelatihan</th><th className="p-3">Materi</th><th className="p-3">Mudah</th><th className="p-3">Relevan</th><th className="p-3">Narasumber</th><th className="text-left p-3">Saran</th></tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800 align-top">
                    <td className="p-3"><div className="font-semibold text-slate-900 dark:text-white">{profiles[row.user_id]?.full_name || 'Peserta'}</div><div className="text-[11px] text-slate-500">{profiles[row.user_id]?.email || '-'}</div></td>
                    <td className="p-3 text-slate-700 dark:text-slate-300">{trainings[row.training_id]?.title || '-'}</td>
                    <td className="p-3 text-center font-semibold">{row.material_rating}</td>
                    <td className="p-3 text-center font-semibold">{row.material_ease_rating}</td>
                    <td className="p-3 text-center font-semibold">{row.relevance_rating}</td>
                    <td className="p-3 text-center font-semibold">{row.speaker_rating}</td>
                    <td className="p-3 min-w-56 text-slate-600 dark:text-slate-400">{row.suggestion || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
