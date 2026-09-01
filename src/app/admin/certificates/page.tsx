'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Certificate, Training, UserProfile } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Search, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 20;

export default function CertificatesAdminPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const list = StorageAPI.getTrainings();
      const selected = StorageAPI.getTraining() || list[0] || null;
      setTrainings(list);
      setSelectedTrainingId(selected?.id || '');
    };
    load();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedTrainingId) return;
    let cancelled = false;
    const loadPage = async () => {
      setLoading(true);
      let matchingIds: string[] | null = null;
      if (debouncedSearch) {
        const safeSearch = debouncedSearch.replace(/[%_,().]/g, ' ');
        const { data } = await supabase.from('profiles').select('id').or(`full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`).eq('role', 'peserta').limit(1000);
        matchingIds = (data || []).map(item => item.id);
      }
      let query = supabase.from('certificates').select('*', { count: 'exact' }).eq('training_id', selectedTrainingId).order('issued_at', { ascending: false });
      if (debouncedSearch) {
        const safeSearch = debouncedSearch.replace(/[%_,().]/g, ' ');
        const profileFilter = matchingIds?.length ? `,user_id.in.(${matchingIds.join(',')})` : '';
        query = query.or(`verification_code.ilike.%${safeSearch}%,certificate_number.ilike.%${safeSearch}%${profileFilter}`);
      }
      const from = (currentPage - 1) * PAGE_SIZE;
      const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (cancelled) return;
      if (error) { console.error(error); setCertificates([]); setTotalCount(0); setLoading(false); return; }
      const certRows = (data || []) as Certificate[];
      const ids = [...new Set(certRows.map(cert => cert.user_id))];
      const { data: profileRows } = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [] };
      const profileMap = new Map(((profileRows || []) as UserProfile[]).map(profile => [profile.id, profile]));
      setCertificates(certRows.map(cert => ({ ...cert, user_name: profileMap.get(cert.user_id)?.full_name || 'Peserta', user_institution: profileMap.get(cert.user_id)?.institution || '' })));
      setTotalCount(count || 0); setLoading(false);
    };
    loadPage();
    return () => { cancelled = true; };
  }, [selectedTrainingId, debouncedSearch, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      
      <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div><h2 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan</h2><p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Sertifikat dimuat per halaman untuk menghemat bandwidth.</p></div>
        <select value={selectedTrainingId} onChange={event => { setSelectedTrainingId(event.target.value); StorageAPI.setSelectTraining(event.target.value); setCurrentPage(1); }} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white">
          {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
          {trainings.map(training => <option key={training.id} value={training.id}>{training.active ? 'AKTIF' : 'NONAKTIF'} — {training.title}</option>)}
        </select>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daftar Sertifikat Diterbitkan</h2>
          <p className="text-xs text-slate-500 mt-0.5">Seluruh sertifikat peserta yang telah dinyatakan LULUS.</p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari nama, kode, nomor sertifikat..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="p-4">Nama Peserta</th>
                <th className="p-4">Nomor Sertifikat</th>
                <th className="p-4">Kode Verifikasi</th>
                <th className="p-4 text-center">Nilai Post-Test</th>
                <th className="p-4">Tanggal Terbit</th>
                <th className="p-4 text-right">Aksi Verifikasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {loading ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">Memuat data...</td></tr> : certificates.length > 0 ? (
                certificates.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-4">
                      <p className="font-bold text-slate-900 dark:text-white">{c.user_name || 'Peserta'}</p>
                      <p className="text-slate-400 text-[11px]">{c.user_institution}</p>
                    </td>
                    <td className="p-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {c.certificate_number || <span className="text-slate-400 italic">Tanpa No.</span>}
                    </td>
                    <td className="p-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {c.verification_code}
                    </td>
                    <td className="p-4 text-center font-mono font-bold">{c.posttest_score}</td>
                    <td className="p-4 text-slate-500">{formatDateIndonesian(c.issued_at)}</td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/verify/${c.verification_code}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Verifikasi
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">Belum ada sertifikat diterbitkan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Menampilkan {certificates.length} dari {totalCount} sertifikat</span>
        <div className="flex items-center gap-2"><button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1 || loading} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><span className="font-semibold text-slate-900 dark:text-white">Halaman {currentPage} dari {totalPages}</span><button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages || loading} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div>
      </div>

    </div>
  );
}
