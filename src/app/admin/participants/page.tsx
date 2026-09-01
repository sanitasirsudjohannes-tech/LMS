'use client';

import React, { useState, useEffect } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { UserProfile, TestAttempt, Certificate, Training, MaterialProgress, Material } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Search, Download, Filter, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function ParticipantsAdminPage() {
  const [participants, setParticipants] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [progress, setProgress] = useState<MaterialProgress[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [training, setTraining] = useState<Training | null>(null);

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const profiles = StorageAPI.getProfiles().filter(p => p.role === 'peserta');
      setParticipants(profiles);

      const atts = StorageAPI.getAllTestAttempts();
      setAttempts(atts);

      const certs = StorageAPI.getCertificates();
      setCertificates(certs);

      setProgress(StorageAPI.getMaterialProgress());
      const trainingList = StorageAPI.getTrainings();
      setMaterials(trainingList.flatMap(item => StorageAPI.getMaterials(item.id)));
      const tr = StorageAPI.getTraining() || trainingList[0] || null;
      setTrainings(trainingList);
      setTraining(tr);
      setSelectedTrainingId(tr?.id || '');
    };
    load();
  }, []);

  const getParticipantStats = (userId: string) => {
    const trainingAttempts = attempts.filter(a => a.user_id === userId && a.training_id === selectedTrainingId);
    const pre = trainingAttempts.find(a => a.test_type === 'pretest');
    const postAttempts = trainingAttempts.filter(a => a.test_type === 'posttest');
    const bestPostScore = postAttempts.reduce((max, a) => Math.max(max, a.score), 0);
    const cert = certificates.find(c => c.user_id === userId && c.training_id === selectedTrainingId);

    const isPassed = postAttempts.some(a => a.score >= (training?.passing_score || 80));
    
    let status = 'Belum Mulai';
    if (isPassed) status = 'Lulus';
    else if (postAttempts.length > 0) status = 'Belum Lulus';
    else if (pre) status = 'Sedang Mengikuti';

    return {
      preScore: pre ? pre.score : '-',
      postScore: postAttempts.length > 0 ? bestPostScore : '-',
      isPassed,
      status,
      certNumber: cert ? cert.certificate_number || 'Aktif (Tanpa No)' : '-'
    };
  };

  const participantHasTrainingActivity = (userId: string) => {
    const materialIds = new Set(materials.filter(material => material.training_id === selectedTrainingId).map(material => material.id));
    return attempts.some(attempt => attempt.user_id === userId && attempt.training_id === selectedTrainingId)
      || certificates.some(certificate => certificate.user_id === userId && certificate.training_id === selectedTrainingId)
      || progress.some(item => item.user_id === userId && materialIds.has(item.material_id));
  };

  const handleTrainingChange = (trainingId: string) => {
    const selected = trainings.find(item => item.id === trainingId) || null;
    setSelectedTrainingId(trainingId);
    setTraining(selected);
    if (selected) StorageAPI.setSelectTraining(selected.id);
    setCurrentPage(1);
    setFilterStatus('all');
  };

  // Filter & Search Logic
  const filtered = participants.filter(p => {
    if (!selectedTrainingId || !participantHasTrainingActivity(p.id)) return false;
    const matchesSearch = p.full_name.toLowerCase().includes(search.toLowerCase()) ||
                          p.email.toLowerCase().includes(search.toLowerCase()) ||
                          p.institution.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    const stats = getParticipantStats(p.id);
    if (filterStatus === 'passed' && !stats.isPassed) return false;
    if (filterStatus === 'failed' && (stats.isPassed || stats.postScore === '-')) return false;
    if (filterStatus === 'in_progress' && stats.status !== 'Sedang Mengikuti') return false;
    if (filterStatus === 'not_started' && stats.status !== 'Belum Mulai') return false;

    return true;
  }).sort((a, b) => a.full_name.localeCompare(b.full_name, 'id'));

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // CSV Export (PRD Section 20)
  const handleExportCSV = () => {
    const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const headers = ['Pelatihan', 'Nama Peserta', 'Email', 'Instansi', 'NIP/NIK', 'Nilai Pre-Test', 'Nilai Post-Test', 'Status Kelulusan', 'Nomor Sertifikat', 'Tanggal Registrasi'];
    const rows = filtered.map(p => {
      const stats = getParticipantStats(p.id);
      return [
        csvCell(training?.title || ''),
        csvCell(p.full_name),
        csvCell(p.email),
        csvCell(p.institution),
        csvCell(p.nip_nik || ''),
        csvCell(stats.preScore),
        csvCell(stats.postScore),
        csvCell(stats.status),
        csvCell(stats.certNumber),
        csvCell(formatDateIndonesian(p.created_at))
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTrainingName = (training?.title || 'Pelatihan').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    link.setAttribute('href', url);
    link.setAttribute('download', `Daftar_Peserta_${safeTrainingName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Action Bar */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan</h2>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Tabel dan file ekspor hanya menampilkan peserta yang sudah memiliki aktivitas pada pelatihan terpilih.</p>
        </div>
        <select
          value={selectedTrainingId}
          onChange={(event) => handleTrainingChange(event.target.value)}
          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
          {trainings.map(item => (
            <option key={item.id} value={item.id}>{item.active ? 'AKTIF' : 'NONAKTIF'} — {item.title}</option>
          ))}
        </select>
        {training && <p className="text-[11px] text-blue-700 dark:text-blue-300">Menampilkan <strong>{filtered.length}</strong> peserta pada: <strong>{training.title}</strong></p>}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari nama, email, instansi..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Filters & Export */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-2" />
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-slate-800 dark:text-slate-200 text-xs font-semibold py-1 px-2 focus:outline-none"
            >
              <option value="all">Semua Status</option>
              <option value="passed">Lulus</option>
              <option value="failed">Belum Lulus</option>
              <option value="in_progress">Sedang Mengikuti</option>
              <option value="not_started">Belum Mulai</option>
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={!selectedTrainingId || filtered.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor Peserta Pelatihan ({filtered.length})</span>
          </button>
        </div>

      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="p-4">Peserta & Instansi</th>
                <th className="p-4 text-center">Nilai Pre-Test</th>
                <th className="p-4 text-center">Nilai Post-Test</th>
                <th className="p-4 text-center">Status Kelulusan</th>
                <th className="p-4">No. Sertifikat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {paginated.length > 0 ? (
                paginated.map((p) => {
                  const stats = getParticipantStats(p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-4">
                        <p className="font-bold text-slate-900 dark:text-white text-sm">{p.full_name}</p>
                        <p className="text-slate-400 text-[11px]">{p.email} • {p.institution}</p>
                      </td>
                      <td className="p-4 text-center font-mono font-bold text-slate-900 dark:text-white">{stats.preScore}</td>
                      <td className="p-4 text-center font-mono font-bold text-slate-900 dark:text-white">{stats.postScore}</td>
                      <td className="p-4 text-center">
                        {stats.isPassed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Lulus
                          </span>
                        ) : stats.status === 'Belum Lulus' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300">
                            <XCircle className="w-3 h-3" /> Belum Lulus
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Clock className="w-3 h-3" /> {stats.status}
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono text-slate-900 dark:text-white">{stats.certNumber}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">Tidak ada data peserta ditemukan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Menampilkan {paginated.length} dari {filtered.length} peserta</span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-900 dark:text-white">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
