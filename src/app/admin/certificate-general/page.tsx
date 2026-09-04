'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ResponsiveCertificatePreview from '@/components/ResponsiveCertificatePreview';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Certificate, CertificateSettings, Training } from '@/types';
import { formatCertificateNumber } from '@/lib/utils';
import { Save, Upload, UserRoundCog } from 'lucide-react';

export default function CertificateGeneralPage() {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [stampUrl, setStampUrl] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState('');
  const [stampPreview, setStampPreview] = useState('');
  const [previewTraining, setPreviewTraining] = useState<Training | null>(null);
  const [trainingSettings, setTrainingSettings] = useState<CertificateSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        await initLocalStorage();
        const s = await StorageAPI.loadGlobalCertificateSettings();
        setName(s.signatory_name);
        setTitle(s.signatory_title);
        setSignatureUrl(s.signatory_image_url || '');
        setSignaturePreview(s.signatory_image_url || '');
        setStampUrl(s.stamp_image_url || '');
        setStampPreview(s.stamp_image_url || '');

        const trainings = StorageAPI.getTrainings();
        const selected = StorageAPI.getTraining() || trainings[0] || null;
        if (selected) {
          await StorageAPI.loadTrainingResources(selected.id);
          setPreviewTraining(selected);
          setTrainingSettings(StorageAPI.getCertificateSettings(selected.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pengaturan umum gagal dimuat.');
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (signaturePreview.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
    };
  }, [signaturePreview]);

  useEffect(() => {
    return () => {
      if (stampPreview.startsWith('blob:')) URL.revokeObjectURL(stampPreview);
    };
  }, [stampPreview]);

  const chooseFile = async (kind: 'signature' | 'stamp', file?: File) => {
    setError('');
    if (!file) return;
    const { default: Swal } = await import('sweetalert2');
    if (file.type !== 'image/png') {
      await Swal.fire('File Tidak Valid', `${kind === 'signature' ? 'Tanda tangan' : 'Cap'} harus berupa PNG.`, 'warning');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      await Swal.fire('File Terlalu Besar', 'Ukuran file maksimal 2 MB.', 'warning');
      return;
    }

    const preview = URL.createObjectURL(file);
    if (kind === 'signature') {
      if (signaturePreview.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
      setSignatureFile(file);
      setSignaturePreview(preview);
    } else {
      if (stampPreview.startsWith('blob:')) URL.revokeObjectURL(stampPreview);
      setStampFile(file);
      setStampPreview(preview);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { default: Swal } = await import('sweetalert2');
    if (!name.trim() || !title.trim()) {
      await Swal.fire('Data Belum Lengkap', 'Nama dan jabatan direktur wajib diisi.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const newSignature = signatureFile ? await StorageAPI.uploadDirectorSignature(signatureFile) : signatureUrl;
      const newStamp = stampFile ? await StorageAPI.uploadDirectorStamp(stampFile) : stampUrl;
      const saved = await StorageAPI.updateGlobalCertificateSettings({
        signatory_name: name.trim(),
        signatory_title: title.trim(),
        signatory_image_url: newSignature || null,
        stamp_image_url: newStamp || null
      });
      setSignatureUrl(saved.signatory_image_url || '');
      setSignaturePreview(saved.signatory_image_url || '');
      setSignatureFile(null);
      setStampUrl(saved.stamp_image_url || '');
      setStampPreview(saved.stamp_image_url || '');
      setStampFile(null);
      await Swal.fire({
        icon: 'success',
        title: 'Pengaturan Tersimpan',
        text: 'Pengaturan sertifikat umum berhasil disimpan. Sertifikat yang sudah terbit tetap menggunakan data sebelumnya.',
        timer: 2200,
        showConfirmButton: false
      });
    } catch (e) {
      await Swal.fire('Gagal Menyimpan', e instanceof Error ? e.message : 'Pengaturan umum gagal disimpan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const previewSettings = useMemo<CertificateSettings>(() => ({
    id: 'preview-settings',
    training_id: previewTraining?.id || 'preview-training',
    certificate_enabled: trainingSettings?.certificate_enabled ?? true,
    numbering_enabled: trainingSettings?.numbering_enabled ?? true,
    number_format: trainingSettings?.number_format || '{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}',
    start_number: trainingSettings?.start_number || 1,
    number_digits: trainingSettings?.number_digits || 4,
    current_number: trainingSettings?.current_number || trainingSettings?.start_number || 1,
    show_posttest_score: trainingSettings?.show_posttest_score ?? true,
    signatory_name: name.trim() || 'Nama Direktur',
    signatory_title: title.trim() || 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
    signatory_image_url: signaturePreview || null,
    stamp_image_url: stampPreview || null,
    updated_at: new Date().toISOString()
  }), [previewTraining, trainingSettings, name, title, signaturePreview, stampPreview]);

  const previewNumber = formatCertificateNumber(previewSettings.number_format, previewSettings.current_number, previewSettings.number_digits);
  const previewCertificate = useMemo<Certificate>(() => ({
    id: 'certificate-preview',
    user_id: null,
    training_id: previewTraining?.id || null,
    certificate_number: previewSettings.numbering_enabled ? previewNumber : null,
    verification_code: 'PREVIEW-LONTAR',
    issued_at: new Date().toISOString(),
    posttest_score: 88,
    user_name: 'Nama Peserta Contoh',
    user_institution: 'RSUD Prof. Dr. W.Z. Johannes Kupang',
    training_title: previewTraining?.title || 'Judul Pelatihan Contoh',
    training_jpl: previewTraining?.jpl || 1,
    training_start_date: previewTraining?.start_date,
    training_end_date: previewTraining?.end_date
  }), [previewTraining, previewSettings.numbering_enabled, previewNumber]);

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800"><UserRoundCog className="h-5 w-5" /></div><div><h2 className="text-lg font-bold">Pengaturan Sertifikat Umum</h2><p className="text-xs text-slate-500">Direktur, jabatan, tanda tangan, dan cap berlaku untuk semua pelatihan berikutnya.</p></div></div>
    </div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">{error}</div>}

    <form onSubmit={save} className="space-y-5">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">Perubahan hanya digunakan pada sertifikat yang diterbitkan setelah pengaturan disimpan. Sertifikat lama tidak berubah.</div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Nama Direktur<input required value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800" /></label><label className="text-xs font-semibold">Jabatan Direktur<input required value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800" /></label></div>
        <div className="grid gap-5 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-2">
          {[{ kind: 'signature' as const, label: 'Tanda Tangan Direktur', preview: signaturePreview }, { kind: 'stamp' as const, label: 'Cap Rumah Sakit', preview: stampPreview }].map(x => <div key={x.kind} className="space-y-3"><p className="text-xs font-semibold">{x.label} (PNG)</p><div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">{x.preview ? <img src={x.preview} alt={x.label} className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-slate-400">Belum ada gambar</span>}</div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold dark:border-slate-700"><Upload className="h-4 w-4" />Pilih PNG<input type="file" accept="image/png" className="hidden" onChange={e => void chooseFile(x.kind, e.target.files?.[0])} /></label></div>)}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Preview Sertifikat</h3><p className="mt-0.5 text-[11px] text-slate-500">Perubahan nama, jabatan, tanda tangan, dan cap langsung terlihat pada preview sebelum disimpan.</p></div><ResponsiveCertificatePreview certificate={previewCertificate} settings={previewSettings} /></section>

      <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#07375c] hover:bg-[#052c4a] px-5 py-3 text-xs font-bold text-white shadow-sm disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Pengaturan Umum'}</button>
    </form>
  </div>;
}
