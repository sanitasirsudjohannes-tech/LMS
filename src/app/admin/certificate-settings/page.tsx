'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CertificateTemplate from '@/components/CertificateTemplate';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { formatCertificateNumber } from '@/lib/utils';
import { Certificate, CertificateSettings, Training } from '@/types';
import { Check, Eye, GraduationCap, Save, Settings, Upload } from 'lucide-react';

export default function CertificateSettingsAdminPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
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
  };

  const applyGlobalSettings = async () => {
    const global = await StorageAPI.loadGlobalCertificateSettings();
    setSignatoryName(global.signatory_name);
    setSignatoryTitle(global.signatory_title);
    setSignatoryImageUrl(global.signatory_image_url || '');
    setSignaturePreview(global.signatory_image_url || '');
    setSignatureFile(null);
    setStampImageUrl(global.stamp_image_url || '');
    setStampPreview(global.stamp_image_url || '');
    setStampFile(null);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const trainingList = StorageAPI.getTrainings();
        const currentTraining = StorageAPI.getTraining() || trainingList[0];
        setTrainings(trainingList);
        await applyGlobalSettings();
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

  const selectedTraining = trainings.find((training) => training.id === selectedTrainingId);
  const previewNumberSample1 = formatCertificateNumber(numberFormat, currentNumber, numberDigits);
  const previewNumberSample2 = formatCertificateNumber(numberFormat, currentNumber + 1, numberDigits);
  const previewNumberSample3 = formatCertificateNumber(numberFormat, currentNumber + 2, numberDigits);

  const previewSettings = useMemo<CertificateSettings>(() => ({
    id: 'preview-settings',
    training_id: selectedTrainingId || 'preview-training',
    certificate_enabled: certificateEnabled,
    numbering_enabled: numberingEnabled,
    number_format: numberFormat,
    start_number: startNumber,
    number_digits: numberDigits,
    current_number: currentNumber,
    show_posttest_score: showPosttestScore,
    signatory_name: signatoryName.trim() || 'Nama Direktur',
    signatory_title: signatoryTitle.trim() || 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
    signatory_image_url: signaturePreview || null,
    stamp_image_url: stampPreview || null,
    updated_at: new Date().toISOString()
  }), [
    selectedTrainingId,
    certificateEnabled,
    numberingEnabled,
    numberFormat,
    startNumber,
    numberDigits,
    currentNumber,
    showPosttestScore,
    signatoryName,
    signatoryTitle,
    signaturePreview,
    stampPreview
  ]);

  const previewCertificate = useMemo<Certificate>(() => ({
    id: 'certificate-preview',
    user_id: null,
    training_id: selectedTraining?.id || null,
    certificate_number: numberingEnabled ? previewNumberSample1 : null,
    verification_code: 'PREVIEW-LONTAR',
    issued_at: new Date().toISOString(),
    posttest_score: 88,
    user_name: 'Nama Peserta Contoh',
    user_institution: 'RSUD Prof. Dr. W.Z. Johannes Kupang',
    training_title: selectedTraining?.title || 'Judul Pelatihan Contoh',
    training_jpl: selectedTraining?.jpl || 1,
    training_start_date: selectedTraining?.start_date,
    training_end_date: selectedTraining?.end_date
  }), [selectedTraining, numberingEnabled, previewNumberSample1]);

  const handleTrainingChange = async (trainingId: string) => {
    setSelectedTrainingId(trainingId);
    setSavedMsg(false);
    setSaveError('');
    try {
      await StorageAPI.loadTrainingResources(trainingId);
      applySettings(trainingId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Pengaturan sertifikat gagal dimuat.');
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
    if (signaturePreview.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
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
    if (stampPreview.startsWith('blob:')) URL.revokeObjectURL(stampPreview);
    setStampFile(file);
    setStampPreview(URL.createObjectURL(file));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
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
        show_posttest_score: showPosttestScore
      });
      const savedGlobalSettings = await StorageAPI.updateGlobalCertificateSettings({
        signatory_name: signatoryName.trim(),
        signatory_title: signatoryTitle.trim(),
        signatory_image_url: uploadedImageUrl || null,
        stamp_image_url: uploadedStampUrl || null
      });

      setCurrentNumber(savedSettings.current_number);
      setSignatoryImageUrl(savedGlobalSettings.signatory_image_url || '');
      setSignaturePreview(savedGlobalSettings.signatory_image_url || '');
      setSignatureFile(null);
      setStampImageUrl(savedGlobalSettings.stamp_image_url || '');
      setStampPreview(savedGlobalSettings.stamp_image_url || '');
      setStampFile(null);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Pengaturan direktur gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Pengaturan Sertifikat & Penomoran</h2>
          <p className="mt-0.5 text-xs text-slate-500">Nomor diatur per pelatihan; Direktur, tanda tangan, dan cap berlaku untuk seluruh pelatihan.</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white">
          <Settings className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border-2 border-blue-300 bg-blue-50 p-5 shadow-sm dark:border-blue-800 dark:bg-blue-950/30">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan yang Akan Diatur</h3>
            <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">Pilihan pelatihan memengaruhi status sertifikat, nilai, penomoran, dan data pelatihan pada preview.</p>
          </div>
        </div>
        <select
          value={selectedTrainingId}
          onChange={(event) => void handleTrainingChange(event.target.value)}
          disabled={trainings.length === 0}
          className="w-full rounded-xl border border-blue-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-700 dark:bg-slate-900 dark:text-white"
        >
          {trainings.length === 0 && <option value="">Belum ada pelatihan</option>}
          {trainings.map((training) => (
            <option key={training.id} value={training.id}>{training.active ? 'AKTIF' : 'NONAKTIF'} — {training.title}</option>
          ))}
        </select>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40">
          <Check className="h-4 w-4 text-emerald-600" />
          <span>Pengaturan sertifikat berhasil diperbarui.</span>
        </div>
      )}
      {saveError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 dark:bg-red-950/40">{saveError}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="rounded-xl bg-slate-900 px-4 py-3 text-xs text-white">Sedang mengatur sertifikat: <strong>{selectedTraining?.title || 'Belum ada pelatihan dipilih'}</strong></div>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-white">1. Status Sertifikat Digital</h3>
          <label className="flex items-center justify-between gap-4">
            <span><strong className="block text-xs text-slate-900 dark:text-white">Aktifkan Sertifikat Kelulusan?</strong><span className="text-xs text-slate-500">Peserta yang lulus Post-Test berhak memperoleh sertifikat.</span></span>
            <input type="checkbox" checked={certificateEnabled} onChange={(event) => setCertificateEnabled(event.target.checked)} className="h-5 w-5" />
          </label>
          <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <span><strong className="block text-xs text-slate-900 dark:text-white">Tampilkan Nilai Post-Test?</strong><span className="text-xs text-slate-500">Perubahan langsung terlihat pada preview.</span></span>
            <input type="checkbox" checked={showPosttestScore} onChange={(event) => setShowPosttestScore(event.target.checked)} className="h-5 w-5" />
          </label>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-white">2. Penomoran Sertifikat</h3>
          <div className="flex items-center justify-between gap-4">
            <div><strong className="block text-xs text-slate-900 dark:text-white">Gunakan Nomor Sertifikat?</strong><span className="text-xs text-slate-500">Jika tidak, preview menampilkan sertifikat tanpa nomor.</span></div>
            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button type="button" onClick={() => setNumberingEnabled(true)} className={`rounded-lg px-3 py-1 text-xs font-bold ${numberingEnabled ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}>Ya</button>
              <button type="button" onClick={() => setNumberingEnabled(false)} className={`rounded-lg px-3 py-1 text-xs font-bold ${!numberingEnabled ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}>Tidak</button>
            </div>
          </div>

          {numberingEnabled && (
            <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Format Nomor Sertifikat</label>
                <input type="text" required value={numberFormat} onChange={(event) => setNumberFormat(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-xs font-bold dark:border-slate-700 dark:bg-slate-800" />
                <p className="mt-2 text-[10px] text-slate-500">Placeholder: {'{NO}'}, {'{TAHUN}'}, {'{TAHUN2}'}, {'{BULAN}'}, {'{BULAN_ROMAWI}'}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Nomor Awal<input type="number" min={1} value={startNumber} onChange={(event) => setStartNumber(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Jumlah Digit<input type="number" min={1} max={8} value={numberDigits} onChange={(event) => setNumberDigits(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Nomor Urut Saat Ini<input type="number" value={currentNumber} readOnly className="mt-1 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 font-mono text-xs font-bold text-amber-600 dark:border-slate-700 dark:bg-slate-800" /></label>
              </div>
              <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400"><Eye className="h-4 w-4" /><span>Contoh Penomoran</span></div>
                <div className="pt-1 font-mono text-sm font-bold tracking-wider"><p className="text-emerald-400">1. {previewNumberSample1}</p><p className="opacity-80">2. {previewNumberSample2}</p><p className="opacity-60">3. {previewNumberSample3}</p></div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-white">3. Direktur Rumah Sakit — Berlaku untuk Semua Pelatihan</h3>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">Perubahan hanya digunakan oleh sertifikat yang diterbitkan setelah disimpan. Sertifikat lama tetap memakai snapshot sebelumnya.</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Nama Direktur<input type="text" required value={signatoryName} onChange={(event) => setSignatoryName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Jabatan Direktur<input type="text" required value={signatoryTitle} onChange={(event) => setSignatoryTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
          </div>
          <div className="grid grid-cols-1 gap-5 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tanda Tangan Direktur (PNG)</p>
              <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">{signaturePreview ? <img src={signaturePreview} alt="Pratinjau tanda tangan direktur" className="max-h-full max-w-full object-contain p-2" /> : <span className="px-3 text-center text-[11px] text-slate-400">Belum ada tanda tangan</span>}</div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold dark:bg-slate-800"><Upload className="h-4 w-4" /><span>Pilih File PNG</span><input type="file" accept="image/png,.png" className="hidden" onChange={(event) => handleSignatureFile(event.target.files?.[0])} /></label>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Cap Direktur / Rumah Sakit (PNG)</p>
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">{stampPreview ? <img src={stampPreview} alt="Pratinjau cap direktur" className="max-h-full max-w-full object-contain p-2" /> : <span className="px-3 text-center text-[11px] text-slate-400">Belum ada cap</span>}</div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold dark:bg-slate-800"><Upload className="h-4 w-4" /><span>Pilih File Cap PNG</span><input type="file" accept="image/png,.png" className="hidden" onChange={(event) => handleStampFile(event.target.files?.[0])} /></label>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-slate-900 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Eye className="h-4 w-4" /></div>
            <div><h3 className="text-sm font-bold text-slate-900 dark:text-white">4. Preview Sertifikat</h3><p className="mt-0.5 text-[11px] text-slate-500">Preview memakai layout sertifikat peserta yang sebenarnya dan mengikuti perubahan form secara langsung. Data peserta di bawah hanya contoh dan tidak disimpan.</p></div>
          </div>
          {!certificateEnabled && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-semibold text-amber-800">Sertifikat sedang dinonaktifkan untuk pelatihan ini. Preview tetap ditampilkan agar desain dapat diperiksa.</div>}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-2 dark:border-slate-800 dark:bg-slate-950 sm:p-3">
            <div className="relative mx-auto aspect-[1000/707] w-full max-w-[1000px] overflow-hidden bg-white">
              <div className="absolute left-0 top-0 origin-top-left" style={{ transform: 'scale(min(1, calc((100vw - 96px) / 1000)))' }}>
                <CertificateTemplate certificate={previewCertificate} settings={previewSettings} previewMode />
              </div>
            </div>
          </div>
          <p className="text-center text-[10px] text-slate-400">Nama peserta, institusi, nilai, dan kode verifikasi pada preview adalah data contoh.</p>
        </section>

        <div className="flex justify-end">
          <button type="submit" disabled={saving || !selectedTrainingId} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-8 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"><Save className="h-4 w-4" /><span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Sertifikat'}</span></button>
        </div>
      </form>
    </div>
  );
}
