'use client';

import React, { useState, useEffect } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { formatCertificateNumber } from '@/lib/utils';
import { Training } from '@/types';
import { Settings, Eye, Check, Save, Upload, GraduationCap } from 'lucide-react';

export default function CertificateSettingsAdminPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  // Form controls
  const [certificateEnabled, setCertificateEnabled] = useState(true);
  const [numberingEnabled, setNumberingEnabled] = useState(true);
  const [numberFormat, setNumberFormat] = useState('{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}');
  const [startNumber, setStartNumber] = useState(1);
  const [numberDigits, setNumberDigits] = useState(4);
  const [currentNumber, setCurrentNumber] = useState(1);
  const [showPosttestScore, setShowPosttestScore] = useState(true);
  const [signatoryName, setSignatoryName] = useState('Nama Direktur');
  const [signatoryTitle, setSignatoryTitle] = useState('Direktur RSUD Prof. Dr. W.Z. Johannes Kupang');
  const [signatoryImageUrl, setSignatoryImageUrl] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState('');
  const [stampImageUrl, setStampImageUrl] = useState('');
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [stampPreview, setStampPreview] = useState('');

  const [savedMsg, setSavedMsg] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const applySettings = (trainingId: string) => {
    const st = StorageAPI.getCertificateSettings(trainingId);
    setCertificateEnabled(st.certificate_enabled);
    setNumberingEnabled(st.numbering_enabled);
    setNumberFormat(st.number_format);
    setStartNumber(st.start_number);
    setNumberDigits(st.number_digits);
    setCurrentNumber(st.current_number || st.start_number);
    setShowPosttestScore(st.show_posttest_score);
    setSignatoryName(st.signatory_name);
    setSignatoryTitle(st.signatory_title);
    setSignatoryImageUrl(st.signatory_image_url || '');
    setSignaturePreview(st.signatory_image_url || '');
    setSignatureFile(null);
    setStampImageUrl(st.stamp_image_url || '');
    setStampPreview(st.stamp_image_url || '');
    setStampFile(null);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const trainingList = StorageAPI.getTrainings();
        const currentTraining = StorageAPI.getTraining() || trainingList[0];
        setTrainings(trainingList);
        if (currentTraining) {
          StorageAPI.setSelectTraining(currentTraining.id);
          setSelectedTrainingId(currentTraining.id);
          applySettings(currentTraining.id);
        }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Pengaturan sertifikat gagal dimuat.');
      }
    };
    void load();
  }, []);

  useEffect(() => {
    return () => {
      if (signaturePreview.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
      if (stampPreview.startsWith('blob:')) URL.revokeObjectURL(stampPreview);
    };
  }, [signaturePreview, stampPreview]);

  const handleTrainingChange = (trainingId: string) => {
    StorageAPI.setSelectTraining(trainingId);
    setSelectedTrainingId(trainingId);
    setSavedMsg(false);
    setSaveError('');
    applySettings(trainingId);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!selectedTrainingId) {
      setSaveError('Pilih pelatihan terlebih dahulu.');
      return;
    }
    if (numberingEnabled && !numberFormat.includes('{NO}')) {
      setSaveError('Format nomor wajib memuat placeholder {NO}.');
      return;
    }
    if (!Number.isInteger(startNumber) || startNumber < 1) {
      setSaveError('Nomor awal minimal 1.');
      return;
    }
    if (!Number.isInteger(numberDigits) || numberDigits < 1 || numberDigits > 8) {
      setSaveError('Jumlah digit nomor harus antara 1 dan 8.');
      return;
    }
    if (!Number.isInteger(currentNumber) || currentNumber < startNumber) {
      setSaveError('Nomor urut saat ini tidak boleh lebih kecil dari nomor awal.');
      return;
    }

    setSaving(true);
    try {
      const uploadedImageUrl = signatureFile
        ? await StorageAPI.uploadDirectorSignature(signatureFile)
        : signatoryImageUrl;
      const uploadedStampUrl = stampFile
        ? await StorageAPI.uploadDirectorStamp(stampFile)
        : stampImageUrl;
      const savedSettings = await StorageAPI.updateCertificateSettings({
        certificate_enabled: certificateEnabled,
        numbering_enabled: numberingEnabled,
        number_format: numberFormat.trim(),
        start_number: Number(startNumber),
        number_digits: Number(numberDigits),
        current_number: Number(currentNumber),
        show_posttest_score: showPosttestScore,
        signatory_name: signatoryName.trim(),
        signatory_title: signatoryTitle.trim(),
        signatory_image_url: uploadedImageUrl || null,
        stamp_image_url: uploadedStampUrl || null
      });
      setCurrentNumber(savedSettings.current_number);
      setSignatoryImageUrl(uploadedImageUrl);
      setSignaturePreview(uploadedImageUrl);
      setSignatureFile(null);
      setStampImageUrl(uploadedStampUrl);
      setStampPreview(uploadedStampUrl);
      setStampFile(null);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Pengaturan direktur gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureFile = (file?: File) => {
    setSaveError('');
    if (!file) return;
    if (file.type !== 'image/png') {
      setSaveError('Tanda tangan harus berupa file PNG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSaveError('Ukuran tanda tangan maksimal 2 MB.');
      return;
    }
    setSignatureFile(file);
    setSignaturePreview(URL.createObjectURL(file));
  };

  const handleStampFile = (file?: File) => {
    setSaveError('');
    if (!file) return;
    if (file.type !== 'image/png') {
      setSaveError('Cap harus berupa file PNG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSaveError('Ukuran cap maksimal 2 MB.');
      return;
    }
    setStampFile(file);
    setStampPreview(URL.createObjectURL(file));
  };

  // Live Preview Calculation (PRD Section 14.3 requirement)
  const previewNumberSample1 = formatCertificateNumber(numberFormat, currentNumber, numberDigits);
  const previewNumberSample2 = formatCertificateNumber(numberFormat, currentNumber + 1, numberDigits);
  const previewNumberSample3 = formatCertificateNumber(numberFormat, currentNumber + 2, numberDigits);
  const selectedTraining = trainings.find(training => training.id === selectedTrainingId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pengaturan Sertifikat & Penomoran</h2>
          <p className="text-xs text-slate-500 mt-0.5">Konfigurasi toggle sertifikat, format penomoran otomatis, dan penandatangan.</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-900 dark:text-white font-bold shrink-0">
          <Settings className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan yang Akan Diatur</h3>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">Setiap pelatihan memiliki nomor, direktur, dan tanda tangan sertifikat masing-masing.</p>
          </div>
        </div>

        <select
          value={selectedTrainingId}
          onChange={(event) => handleTrainingChange(event.target.value)}
          disabled={trainings.length === 0}
          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
          {trainings.map(training => (
            <option key={training.id} value={training.id}>
              {training.active ? 'AKTIF' : 'NONAKTIF'} — {training.title}
            </option>
          ))}
        </select>

        {selectedTraining && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`px-2.5 py-1 rounded-full font-bold ${
              selectedTraining.active
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              {selectedTraining.active ? 'AKTIF • Tampil di Peserta' : 'NONAKTIF • Disembunyikan'}
            </span>
            <span className="text-blue-700 dark:text-blue-300">Pengaturan di bawah berlaku untuk: <strong>{selectedTraining.title}</strong></span>
          </div>
        )}
      </div>

      {savedMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Pengaturan sertifikat berhasil diperbarui!</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-800 text-xs font-semibold">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="px-4 py-3 rounded-xl bg-slate-900 text-white text-xs">
          Sedang mengatur sertifikat: <strong>{selectedTraining?.title || 'Belum ada pelatihan dipilih'}</strong>
        </div>
        
        {/* Toggle General Certificate */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
            1. Status Sertifikat Digital
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white block">Aktifkan Sertifikat Kelulusan?</span>
              <span className="text-xs text-slate-500">Jika diaktifkan, peserta yang lulus Post-Test berhak mengunduh sertifikat.</span>
            </div>
            <input
              type="checkbox"
              checked={certificateEnabled}
              onChange={(e) => setCertificateEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white block">Tampilkan Nilai Post-Test di Sertifikat?</span>
              <span className="text-xs text-slate-500">Menampilkan nilai kelulusan pada dokumen sertifikat.</span>
            </div>
            <input
              type="checkbox"
              checked={showPosttestScore}
              onChange={(e) => setShowPosttestScore(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Toggle & Format Builder Penomoran (PRD Section 14) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
            2. Toggle & Format Penomoran Sertifikat
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white block">Gunakan Nomor Sertifikat?</span>
              <span className="text-xs text-slate-500">Jika Tidak, sertifikat dibuat tanpa nomor urut.</span>
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setNumberingEnabled(true)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  numberingEnabled ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                Ya
              </button>
              <button
                type="button"
                onClick={() => setNumberingEnabled(false)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  !numberingEnabled ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                Tidak
              </button>
            </div>
          </div>

          {numberingEnabled && (
            <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              
              {/* Format input with placeholders guide */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Format Nomor Sertifikat
                </label>
                <input
                  type="text"
                  required
                  value={numberFormat}
                  onChange={(e) => setNumberFormat(e.target.value)}
                  placeholder="Contoh: {NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900"
                />
                
                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                  <span className="font-bold text-slate-900 dark:text-white block">Placeholder yang didukung:</span>
                  <div className="grid grid-cols-2 gap-1 font-mono">
                    <span>• <strong>{'{NO}'}</strong> : Nomor urut</span>
                    <span>• <strong>{'{TAHUN}'}</strong> : Tahun (2026)</span>
                    <span>• <strong>{'{TAHUN2}'}</strong> : Tahun 2 digit (26)</span>
                    <span>• <strong>{'{BULAN}'}</strong> : Bulan (08)</span>
                    <span>• <strong>{'{BULAN_ROMAWI}'}</strong> : Bulan Romawi (VIII)</span>
                  </div>
                </div>
              </div>

              {/* Number settings grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nomor Awal (Start)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={startNumber}
                    onChange={(e) => setStartNumber(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Jumlah Digit Nomor
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={numberDigits}
                    onChange={(e) => setNumberDigits(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nomor Urut Saat Ini
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={currentNumber}
                    readOnly
                    aria-describedby="current-number-help"
                    className="w-full px-3.5 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-amber-600 cursor-not-allowed"
                  />
                  <p id="current-number-help" className="mt-1 text-[10px] text-slate-500">Dikelola otomatis dan tidak dapat diturunkan.</p>
                </div>
              </div>

              {/* Live Preview Box (PRD Requirement 14.3) */}
              <div className="p-4 bg-slate-900 text-white rounded-xl space-y-2 border border-slate-800 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <Eye className="w-4 h-4" />
                  <span>Live Preview Hasil Penomoran</span>
                </div>
                <div className="font-mono text-sm font-bold tracking-wider space-y-1 pt-1 text-slate-100">
                  <p className="text-emerald-400">1. {previewNumberSample1}</p>
                  <p className="opacity-80">2. {previewNumberSample2}</p>
                  <p className="opacity-60">3. {previewNumberSample3}</p>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Signatory Settings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
            3. Direktur Rumah Sakit
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Direktur Rumah Sakit
              </label>
              <input
                type="text"
                required
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="Masukkan nama lengkap beserta gelar"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Jabatan Direktur
              </label>
              <input
                type="text"
                required
                value={signatoryTitle}
                onChange={(e) => setSignatoryTitle(e.target.value)}
                placeholder="Direktur RSUD Prof. Dr. W.Z. Johannes Kupang"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Tanda Tangan Direktur (PNG)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-48 h-24 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {signaturePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signaturePreview} alt="Pratinjau tanda tangan direktur" className="max-w-full max-h-full object-contain p-2" />
                ) : (
                  <span className="text-[11px] text-slate-400 text-center px-3">Belum ada tanda tangan</span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Pilih File PNG</span>
                <input
                  type="file"
                  accept="image/png,.png"
                  className="hidden"
                  onChange={(event) => handleSignatureFile(event.target.files?.[0])}
                />
              </label>
            </div>
            <p className="text-[10px] text-slate-400">Gunakan PNG transparan, maksimal 2 MB. Klik Simpan untuk mengunggah dan menerapkannya.</p>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Cap Direktur / Rumah Sakit (PNG)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="w-32 h-32 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {stampPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={stampPreview} alt="Pratinjau cap direktur" className="max-w-full max-h-full object-contain p-2" />
                ) : (
                  <span className="text-[11px] text-slate-400 text-center px-3">Belum ada cap</span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Pilih File Cap PNG</span>
                <input
                  type="file"
                  accept="image/png,.png"
                  className="hidden"
                  onChange={(event) => handleStampFile(event.target.files?.[0])}
                />
              </label>
            </div>
            <p className="text-[10px] text-slate-400">Gunakan PNG transparan berbentuk cap, maksimal 2 MB. Cap akan ditempatkan proporsional di belakang tanda tangan Direktur.</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white font-bold rounded-xl text-sm transition-all shadow-md inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Sertifikat'}</span>
          </button>
        </div>

      </form>
    </div>
  );
}
