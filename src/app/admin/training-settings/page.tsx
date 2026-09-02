'use client';

import React, { useState, useEffect } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { DatabaseUsage, Training, TrainingMaintenance, TrainingStatus } from '@/types';
import { Plus, Edit2, Trash2, X, Award, Calendar, Archive, Download, Database, Eraser, ShieldCheck } from 'lucide-react';
import { formatDateInputWita, toWitaDateBoundary } from '@/lib/utils';
import { downloadTrainingBackupZip } from '@/lib/trainingBackup';

export default function TrainingSettingsAdminPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [passingScore, setPassingScore] = useState(80);
  const [jpl, setJpl] = useState(1);
  const [status, setStatus] = useState<TrainingStatus>('active');
  const [editingPurged, setEditingPurged] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [maintenance, setMaintenance] = useState<Record<string, TrainingMaintenance>>({});
  const [databaseUsage, setDatabaseUsage] = useState<DatabaseUsage | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadMaintenance = async () => {
    const [rows, usage] = await Promise.all([
      StorageAPI.getTrainingMaintenance(),
      StorageAPI.getDatabaseUsage()
    ]);
    setMaintenance(Object.fromEntries(rows.map(row => [row.training_id, row])));
    setDatabaseUsage(usage);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const list = StorageAPI.getTrainings();
        setTrainings(list);
        setSelectedTraining(StorageAPI.getTraining());
        await loadMaintenance();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Daftar pelatihan gagal dimuat.');
      }
    };
    void load();
  }, []);

  const reloadTrainings = () => {
    const list = StorageAPI.getTrainings();
    setTrainings(list);
    const activeOne = StorageAPI.getTraining();
    setSelectedTraining(activeOne);
  };

  const formatDateForInput = (isoString?: string) => {
    return formatDateInputWita(isoString);
  };

  const handleOpenCreate = () => {
    const today = formatDateInputWita(new Date().toISOString());
    const nextMonth = formatDateInputWita(new Date(Date.now() + 30 * 86400000).toISOString());

    setEditingId(null);
    setTitle('');
    setDescription('');
    setStartDate(today);
    setEndDate(nextMonth);
    setPassingScore(80);
    setJpl(1);
    setStatus('draft');
    setEditingPurged(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: Training) => {
    setEditingId(t.id);
    setTitle(t.title);
    setDescription(t.description || '');
    setStartDate(formatDateForInput(t.start_date));
    setEndDate(formatDateForInput(t.end_date));
    setPassingScore(t.passing_score);
    setJpl(t.jpl || 1);
    setStatus(t.status || (t.active ? 'active' : 'archived'));
    setEditingPurged(Boolean(t.operational_data_purged_at));
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const { default: Swal } = await import('sweetalert2');

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      Swal.fire({
        icon: 'error',
        title: 'Tanggal Tidak Valid',
        text: 'Tanggal mulai tidak boleh lebih besar dari tanggal selesai pelatihan.'
      });
      return;
    }

    try {
      await StorageAPI.saveTraining({
        id: editingId || undefined,
        title: title.trim(),
        description: description.trim(),
        start_date: startDate ? toWitaDateBoundary(startDate, 'start') : undefined,
        end_date: endDate ? toWitaDateBoundary(endDate, 'end') : undefined,
        passing_score: Number(passingScore),
        max_posttest_attempts: 5,
        jpl: Number(jpl),
        active: status === 'active',
        status
      });
      if (editingId && status === 'archived') {
        await StorageAPI.archiveTraining(editingId);
      }

      setIsModalOpen(false);
      await Swal.fire({
        icon: 'success',
        title: 'Tersimpan!',
        text: status === 'active'
          ? 'Pelatihan aktif dan sekarang terlihat oleh peserta.'
          : status === 'archived'
            ? 'Pelatihan diarsipkan. Sertifikat peserta tetap tersimpan.'
            : 'Pelatihan disimpan sebagai draf dan belum terlihat oleh peserta.',
        timer: 2200,
        showConfirmButton: false
      });
      reloadTrainings();
      await loadMaintenance();
    } catch (error) {
      await Swal.fire('Gagal Menyimpan', error instanceof Error ? error.message : 'Data pelatihan gagal disimpan.', 'error');
    }
  };

  const handleArchive = async (training: Training) => {
    const { default: Swal } = await import('sweetalert2');
    const result = await Swal.fire({
      icon: 'question',
      title: 'Arsipkan Pelatihan?',
      text: `"${training.title}" tidak lagi tampil kepada peserta. Data dan sertifikat tetap tersimpan.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Arsipkan',
      cancelButtonText: 'Batal'
    });
    if (!result.isConfirmed) return;
    setProcessingId(training.id);
    try {
      await StorageAPI.archiveTraining(training.id);
      reloadTrainings();
      await loadMaintenance();
      await Swal.fire('Berhasil', 'Pelatihan masuk ke Arsip dan statistiknya sudah disimpan.', 'success');
    } catch (error) {
      await Swal.fire('Gagal', error instanceof Error ? error.message : 'Pelatihan gagal diarsipkan.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBackup = async (training: Training) => {
    const { default: Swal } = await import('sweetalert2');
    setProcessingId(training.id);
    try {
      const backup = await StorageAPI.exportTrainingBackup(training.id);
      await downloadTrainingBackupZip(backup);
      await loadMaintenance();
      await Swal.fire({
        icon: 'success',
        title: 'Backup Diunduh',
        html: `Simpan ZIP di tempat aman.<br><small>Backup ID: <code>${backup.backup_id}</code></small>`
      });
    } catch (error) {
      await Swal.fire('Backup Gagal', error instanceof Error ? error.message : 'Backup tidak dapat dibuat.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handlePurge = async (training: Training) => {
    const { default: Swal } = await import('sweetalert2');
    const state = maintenance[training.id];
    if (!state?.last_backup_id) {
      await Swal.fire('Backup Diperlukan', 'Unduh Backup Pelatihan terlebih dahulu sebelum membersihkan data.', 'warning');
      return;
    }
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Bersihkan Data Operasional?',
      html: 'Materi, soal, sesi, jawaban, progres, dan hasil percobaan akan dihapus.<br><b>Log, statistik, dan sertifikat tetap ada.</b>',
      input: 'text',
      inputLabel: `Ketik nama pelatihan: ${training.title}`,
      inputPlaceholder: training.title,
      showCancelButton: true,
      confirmButtonText: 'Bersihkan Data',
      confirmButtonColor: '#dc2626',
      preConfirm: value => {
        if (value !== training.title) {
          Swal.showValidationMessage('Nama pelatihan belum sesuai.');
          return false;
        }
        return true;
      }
    });
    if (!result.isConfirmed) return;
    setProcessingId(training.id);
    try {
      const removed = await StorageAPI.purgeArchivedTraining(training.id, state.last_backup_id);
      reloadTrainings();
      await loadMaintenance();
      await Swal.fire({
        icon: 'success',
        title: 'Data Operasional Dibersihkan',
        text: `${removed.attempts || 0} hasil tes, ${removed.sessions || 0} sesi, ${removed.progress || 0} progres, ${removed.questions || 0} soal, dan ${removed.materials || 0} materi dihapus. Sertifikat tetap tersimpan.`
      });
    } catch (error) {
      await Swal.fire('Pembersihan Gagal', error instanceof Error ? error.message : 'Data tidak dapat dibersihkan.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (t: Training) => {
    const { default: Swal } = await import('sweetalert2');
    Swal.fire({
      title: 'Hapus Pelatihan?',
      text: `Materi, soal, hasil tes, dan progres "${t.title}" akan dihapus. Sertifikat yang sudah terbit tetap dipertahankan sebagai dokumen permanen.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Ya, Hapus!',
      cancelButtonText: 'Batal'
    }).then(async (result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: 'Menghapus...',
          text: 'Mohon tunggu sebentar',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        try {
          await StorageAPI.deleteTraining(t.id);
          reloadTrainings();
          Swal.fire({
            icon: 'success',
            title: 'Terhapus!',
            text: 'Pelatihan telah berhasil dihapus.',
            timer: 2000,
            showConfirmButton: false
          });
        } catch (err: unknown) {
          Swal.fire({
            icon: 'error',
            title: 'Gagal Hapus',
            text: err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus pelatihan.'
          });
        }
      }
    });
  };

  const handleSelectActive = async (t: Training) => {
    const { default: Swal } = await import('sweetalert2');
    StorageAPI.setSelectTraining(t.id);
    setSelectedTraining(t);
    Swal.fire({
      icon: 'info',
      title: 'Pelatihan Dipilih',
      text: `"${t.title}" sekarang dipilih untuk dikelola. Status publikasinya tetap ${t.active ? 'Aktif' : 'Nonaktif'}.`,
      timer: 1500,
      showConfirmButton: false
    });
  };

  const formatPeriodDisplay = (startIso?: string, endIso?: string) => {
    if (!startIso && !endIso) return 'Periode: Tidak Diatur';
    const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Makassar' };
    const startStr = startIso ? new Date(startIso).toLocaleDateString('id-ID', dateOptions) : 'Awal';
    const endStr = endIso ? new Date(endIso).toLocaleDateString('id-ID', dateOptions) : 'Selesai';
    return `${startStr} - ${endStr}`;
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {loadError && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{loadError}</div>}
      
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Kelola & Periode Pelatihan</h2>
          <p className="text-xs text-slate-500 mt-0.5">Status Aktif menentukan tampilan peserta. Pilihan Kelola hanya menentukan pelatihan yang sedang diedit admin.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Pelatihan Baru</span>
        </button>
      </div>

      {databaseUsage && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              <div><h3 className="text-sm font-bold">Kapasitas Database</h3><p className="text-[11px] text-slate-500">Batas aman operasional ditetapkan 400 MB</p></div>
            </div>
            <strong className="text-sm font-mono">{databaseUsage.megabytes} MB</strong>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${databaseUsage.megabytes >= 350 ? 'bg-red-500' : databaseUsage.megabytes >= 300 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, databaseUsage.safe_usage_percent)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">{databaseUsage.safe_usage_percent}% dari batas aman. Peringatan dimulai pada 300 MB.</p>
        </div>
      )}

      {/* Trainings List */}
      <div className="space-y-3">
        {trainings.length > 0 ? (
          trainings.map((t) => {
            const isCurrentActive = selectedTraining?.id === t.id;
            const maintenanceState = maintenance[t.id];
            const isProcessing = processingId === t.id;
            return (
              <div
                key={t.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 sm:p-5 shadow-sm transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isCurrentActive ? 'border-slate-900 ring-1 ring-slate-900 dark:border-slate-100 dark:ring-slate-100' : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start gap-3 w-full sm:w-auto min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 mt-0.5 ${
                    isCurrentActive ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[220px] sm:max-w-xs">{t.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        t.status === 'active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' : t.status === 'archived' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t.status === 'active' ? 'AKTIF • Tampil di Peserta' : t.status === 'archived' ? 'ARSIP • Sertifikat Dipertahankan' : 'DRAF • Belum Dipublikasikan'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 break-words">{t.description || 'Tidak ada deskripsi'}</p>
                    <div className="flex items-center gap-3 sm:gap-4 text-[11px] text-slate-400 mt-2 font-mono flex-wrap">
                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                        <Calendar className="w-3 h-3" /> {formatPeriodDisplay(t.start_date, t.end_date)}
                      </span>
                      <span>Passing Score: {t.passing_score}</span>
                      <span>• Max Percobaan: {t.max_posttest_attempts}x</span>
                      <span>• {t.jpl || 1} JPL</span>
                    </div>
                    {maintenanceState && (
                      <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-slate-500">
                        <span>{maintenanceState.participant_count} peserta</span>
                        <span>• {maintenanceState.attempt_count} hasil tes</span>
                        <span>• {maintenanceState.certificate_count} sertifikat</span>
                        {maintenanceState.last_backup_at && <span className="text-emerald-700 dark:text-emerald-400">• Backup tersedia</span>}
                        {maintenanceState.operational_data_purged_at && <span className="text-blue-700 dark:text-blue-400">• Data operasional sudah dibersihkan</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 dark:border-slate-800 shrink-0">
                  {!isCurrentActive && (
                    <button
                      onClick={() => handleSelectActive(t)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      Kelola Ini
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenEdit(t)}
                    className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Edit Pelatihan"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {t.status !== 'draft' && (
                    <button disabled={isProcessing} onClick={() => handleBackup(t)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                      <Download className="w-3.5 h-3.5" /> Backup
                    </button>
                  )}
                  {t.status !== 'archived' && (
                    <button disabled={isProcessing} onClick={() => handleArchive(t)} className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                      <Archive className="w-3.5 h-3.5" /> Arsipkan
                    </button>
                  )}
                  {t.status === 'archived' && !maintenanceState?.operational_data_purged_at && (
                    <button disabled={isProcessing} onClick={() => handlePurge(t)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                      <Eraser className="w-3.5 h-3.5" /> Bersihkan
                    </button>
                  )}
                  {t.status === 'draft' && (
                    <button disabled={isProcessing} onClick={() => handleDelete(t)} title="Hapus Draf" className="px-3 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" /><span>Hapus Draf</span>
                    </button>
                  )}
                  {maintenanceState?.operational_data_purged_at && <ShieldCheck className="w-5 h-5 text-emerald-600" aria-label="Log dan sertifikat terlindungi" />}
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs space-y-3">
            <p>Belum ada pelatihan yang dibuat di LONTAR.</p>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Pelatihan Pertama</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-7 max-w-lg w-full space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                {editingId ? 'Edit Pelatihan & Periode' : 'Tambah Pelatihan Baru'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Judul Pelatihan</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Pelatihan K3 Rumah Sakit"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Deskripsi Singkat</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ringkasan penjelasan mengenai pelatihan..."
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              {/* Periode Pelatihan Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" /> Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" /> Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Passing Grade (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={passingScore}
                    onChange={(e) => setPassingScore(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Jam Pelajaran (JPL)</label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    required
                    value={jpl}
                    onChange={(e) => setJpl(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Batas Post-Test ditetapkan sistem sebanyak 5 kali.</p>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label htmlFor="trainingStatus" className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5" /> Status Pelatihan
                </label>
                <select
                  id="trainingStatus"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as TrainingStatus)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                >
                  <option value="draft" disabled={editingPurged}>Draf — belum ditampilkan</option>
                  <option value="active" disabled={editingPurged}>Aktif — tampil kepada peserta</option>
                  <option value="archived">Arsip — kegiatan selesai, sertifikat tetap ada</option>
                </select>
                <p className="text-[10px] text-slate-400">Gunakan Arsip setelah kegiatan selesai. Data lama tidak dimuat ke dashboard peserta, sedangkan sertifikat tetap tersedia dan dapat diverifikasi.</p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold"
                >
                  Simpan Pelatihan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
