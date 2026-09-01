'use client';

import React, { useEffect, useState } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Training } from '@/types';
import { supabase } from '@/lib/supabase';
import { formatDateIndonesian } from '@/lib/utils';
import { Search, Download, Filter, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface ParticipantRow {
  user_id: string; full_name: string; email: string; institution: string; nip_nik?: string | null;
  created_at: string; pre_score?: number | null; post_score?: number | null; status: string;
  certificate_number?: string | null; total_count: number;
}

const PAGE_SIZE = 20;

export default function ParticipantsAdminPage() {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const selectedTraining = trainings.find(item => item.id === selectedTrainingId) || null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

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
    if (!selectedTrainingId) return;
    let cancelled = false;
    const loadPage = async () => {
      setLoading(true);
      setLoadError('');
      const { data, error } = await supabase.rpc('admin_training_participants', {
        p_training_id: selectedTrainingId, p_search: debouncedSearch, p_status: filterStatus,
        p_limit: PAGE_SIZE, p_offset: (currentPage - 1) * PAGE_SIZE
      });
      if (cancelled) return;
      if (error) {
        console.error(error);
        setRows([]);
        setTotalCount(0);
        setLoadError(error.message);
      }
      else {
        const result = (data || []) as ParticipantRow[];
        setRows(result);
        setTotalCount(Number(result[0]?.total_count || 0));
      }
      setLoading(false);
    };
    loadPage();
    return () => { cancelled = true; };
  }, [selectedTrainingId, debouncedSearch, filterStatus, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const handleTrainingChange = (trainingId: string) => {
    setSelectedTrainingId(trainingId); StorageAPI.setSelectTraining(trainingId);
    setCurrentPage(1); setFilterStatus('all');
  };

  const handleExportCSV = async () => {
    if (!selectedTrainingId) return;
    setExporting(true);
    const { data, error } = await supabase.rpc('admin_training_participants', {
      p_training_id: selectedTrainingId, p_search: debouncedSearch, p_status: filterStatus,
      p_limit: 10000, p_offset: 0
    });
    setExporting(false);
    if (error) return alert(`Gagal mengekspor peserta: ${error.message}`);
    const cell = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = ['Pelatihan', 'Nama Peserta', 'Email', 'Instansi', 'NIP/NIK', 'Nilai Pre-Test', 'Nilai Post-Test', 'Status Kelulusan', 'Nomor Sertifikat', 'Tanggal Registrasi'];
    const exportRows = ((data || []) as ParticipantRow[]).map(row => [selectedTraining?.title, row.full_name, row.email, row.institution, row.nip_nik, row.pre_score, row.post_score, row.status, row.certificate_number, formatDateIndonesian(row.created_at)].map(cell).join(','));
    const blob = new Blob(['\uFEFF' + [headers.map(cell).join(','), ...exportRows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (selectedTraining?.title || 'Pelatihan').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    link.href = url; link.download = `Daftar_Peserta_${safeName}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-6">
    {loadError && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"><strong>Daftar peserta gagal dimuat.</strong> {loadError}</div>}
    <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm space-y-3">
      <div><h2 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan</h2><p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Data dimuat per halaman agar lebih cepat dan hemat bandwidth.</p></div>
      <select value={selectedTrainingId} onChange={event => handleTrainingChange(event.target.value)} className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
        {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
        {trainings.map(item => <option key={item.id} value={item.id}>{item.active ? 'AKTIF' : 'NONAKTIF'} — {item.title}</option>)}
      </select>
    </div>
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="relative w-full md:w-80"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" /><input value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Cari nama, email, instansi..." className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
        <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs"><Filter className="w-3.5 h-3.5 text-slate-400 ml-2" /><select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="bg-transparent text-slate-800 dark:text-slate-200 text-xs font-semibold py-1 px-2 focus:outline-none"><option value="all">Semua Status</option><option value="passed">Lulus</option><option value="failed">Belum Lulus</option><option value="in_progress">Sedang Mengikuti</option><option value="not_started">Belum Mulai</option></select></div>
        <button onClick={handleExportCSV} disabled={!selectedTrainingId || totalCount === 0 || exporting} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"><Download className="w-4 h-4" />{exporting ? 'Menyiapkan...' : `Ekspor (${totalCount})`}</button>
      </div>
    </div>
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider"><tr><th className="p-4">Peserta & Instansi</th><th className="p-4 text-center">Pre-Test</th><th className="p-4 text-center">Post-Test</th><th className="p-4 text-center">Status</th><th className="p-4">No. Sertifikat</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">{loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">Memuat data...</td></tr> : loadError ? <tr><td colSpan={5} className="p-8 text-center text-red-600">Data gagal dimuat. Periksa pesan kesalahan di atas.</td></tr> : rows.length ? rows.map(row => <tr key={row.user_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40"><td className="p-4"><p className="font-bold text-slate-900 dark:text-white text-sm">{row.full_name}</p><p className="text-slate-400 text-[11px]">{row.email} • {row.institution}</p></td><td className="p-4 text-center font-mono font-bold">{row.pre_score ?? '-'}</td><td className="p-4 text-center font-mono font-bold">{row.post_score ?? '-'}</td><td className="p-4 text-center">{row.status === 'Lulus' ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="w-3 h-3" />Lulus</span> : row.status === 'Belum Lulus' ? <span className="inline-flex items-center gap-1 text-red-700 font-bold"><XCircle className="w-3 h-3" />Belum Lulus</span> : <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{row.status}</span>}</td><td className="p-4 font-mono">{row.certificate_number || '-'}</td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-slate-400">Tidak ada data peserta ditemukan.</td></tr>}</tbody></table></div>
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500"><span>Menampilkan {rows.length} dari {totalCount} peserta</span><div className="flex items-center gap-2"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button><span className="font-semibold text-slate-900 dark:text-white">Halaman {currentPage} dari {totalPages}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || loading} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button></div></div>
    </div>
  </div>;
}
