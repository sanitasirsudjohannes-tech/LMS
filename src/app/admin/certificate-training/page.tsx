'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ResponsiveCertificatePreview from '@/components/ResponsiveCertificatePreview';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Training, Certificate, CertificateSettings, CertificateGlobalSettings } from '@/types';
import { formatCertificateNumber } from '@/lib/utils';
import { Eye, Save, SlidersHorizontal } from 'lucide-react';

export default function CertificateTrainingPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainingId, setTrainingId] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [showScore, setShowScore] = useState(true);
  const [numbering, setNumbering] = useState(true);
  const [format, setFormat] = useState('{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}');
  const [start, setStart] = useState(1);
  const [digits, setDigits] = useState(4);
  const [current, setCurrent] = useState(1);
  const [globalSettings, setGlobalSettings] = useState<CertificateGlobalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  const apply = (id: string) => {
    const s = StorageAPI.getCertificateSettings(id);
    setEnabled(s.certificate_enabled);
    setShowScore(s.show_posttest_score);
    setNumbering(s.numbering_enabled);
    setFormat(s.number_format);
    setStart(s.start_number);
    setDigits(s.number_digits);
    setCurrent(s.current_number || s.start_number);
  };

  useEffect(() => {
    void (async () => {
      try {
        await initLocalStorage();
        const list = StorageAPI.getTrainings();
        const selected = StorageAPI.getTraining() || list[0];
        setTrainings(list);
        setGlobalSettings(await StorageAPI.loadGlobalCertificateSettings());
        if (selected) {
          setSwitching(true);
          await StorageAPI.loadTrainingResources(selected.id);
          setTrainingId(selected.id);
          apply(selected.id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pengaturan gagal dimuat.');
      } finally {
        setSwitching(false);
      }
    })();
  }, []);

  const change = async (id: string) => {
    if (!id || switching) return;
    setTrainingId(id);
    setError('');
    setSwitching(true);
    try {
      await StorageAPI.loadTrainingResources(id);
      apply(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pengaturan gagal dimuat.');
    } finally {
      setSwitching(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { default: Swal } = await import('sweetalert2');

    if (!trainingId) { await Swal.fire('Pilih Pelatihan', 'Pilih pelatihan terlebih dahulu.', 'warning'); return; }
    if (numbering && !format.includes('{NO}')) { await Swal.fire('Format Tidak Valid', 'Format nomor wajib memuat {NO}.', 'warning'); return; }
    if (!Number.isInteger(start) || start < 1) { await Swal.fire('Nomor Awal Tidak Valid', 'Nomor awal harus berupa bilangan bulat minimal 1.', 'warning'); return; }
    if (!Number.isInteger(digits) || digits < 1 || digits > 8) { await Swal.fire('Jumlah Digit Tidak Valid', 'Jumlah digit harus berupa bilangan bulat antara 1 dan 8.', 'warning'); return; }
    if (!Number.isInteger(current) || current < start) { await Swal.fire('Nomor Urut Tidak Valid', 'Nomor urut saat ini tidak boleh lebih kecil dari nomor awal.', 'warning'); return; }

    setSaving(true);
    try {
      await StorageAPI.loadTrainingResources(trainingId);
      const s = await StorageAPI.updateCertificateSettings({
        certificate_enabled: enabled,
        show_posttest_score: showScore,
        numbering_enabled: numbering,
        number_format: format.trim(),
        start_number: Number(start),
        number_digits: Number(digits),
        current_number: Number(current)
      });
      setCurrent(s.current_number);
      await Swal.fire({
        icon: 'success',
        title: 'Pengaturan Tersimpan',
        text: 'Pengaturan sertifikat untuk pelatihan ini berhasil disimpan.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (e) {
      await Swal.fire('Gagal Menyimpan', e instanceof Error ? e.message : 'Pengaturan gagal disimpan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selected = trainings.find(t => t.id === trainingId);
  const samples = [0, 1, 2].map(n => formatCertificateNumber(format, current + n, digits));
  const previewNumber = samples[0];

  const previewSettings = useMemo<CertificateSettings>(() => ({
    id: 'preview-settings',
    training_id: trainingId || 'preview-training',
    certificate_enabled: enabled,
    numbering_enabled: numbering,
    number_format: format,
    start_number: start,
    number_digits: digits,
    current_number: current,
    show_posttest_score: showScore,
    signatory_name: globalSettings?.signatory_name || 'Nama Direktur',
    signatory_title: globalSettings?.signatory_title || 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang',
    signatory_image_url: globalSettings?.signatory_image_url || null,
    stamp_image_url: globalSettings?.stamp_image_url || null,
    updated_at: new Date().toISOString()
  }), [trainingId, enabled, numbering, format, start, digits, current, showScore, globalSettings]);

  const previewCertificate = useMemo<Certificate>(() => ({
    id: 'certificate-preview',
    user_id: null,
    training_id: selected?.id || null,
    certificate_number: numbering ? previewNumber : null,
    verification_code: 'PREVIEW-LONTAR',
    issued_at: new Date().toISOString(),
    posttest_score: 88,
    user_name: 'Nama Peserta Contoh',
    user_institution: 'RSUD Prof. Dr. W.Z. Johannes Kupang',
    training_title: selected?.title || 'Judul Pelatihan Contoh',
    training_jpl: selected?.jpl || 1,
    training_start_date: selected?.start_date,
    training_end_date: selected?.end_date
  }), [selected, numbering, previewNumber]);

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><div className="flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800"><SlidersHorizontal className="h-5 w-5" /></div><div><h2 className="text-lg font-bold">Pengaturan Sertifikat per Pelatihan</h2><p className="text-xs text-slate-500">Atur status sertifikat, nilai Post-Test, dan penomoran khusus pelatihan.</p></div></div></div>

    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-950/30"><label className="text-xs font-bold text-blue-950 dark:text-blue-100">Pilih Pelatihan<select value={trainingId} disabled={switching || trainings.length === 0} onChange={e => void change(e.target.value)} className="mt-2 w-full rounded-xl border border-blue-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 disabled:opacity-60 dark:border-blue-700 dark:bg-slate-900 dark:text-white">{trainings.length === 0 && <option value="">Belum ada pelatihan</option>}{trainings.map(t => <option key={t.id} value={t.id}>{t.active ? 'AKTIF' : 'NONAKTIF'} — {t.title}</option>)}</select></label>{switching && <p className="mt-2 text-[11px] font-semibold text-blue-700 dark:text-blue-300">Memuat pengaturan pelatihan...</p>}</div>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">{error}</div>}

    <form onSubmit={save} className="space-y-5">
      <div className="rounded-xl bg-slate-900 px-4 py-3 text-xs text-white">Sedang mengatur: <strong>{selected?.title || 'Belum ada pelatihan dipilih'}</strong></div>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-bold">Status Sertifikat</h3><label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800"><span><strong className="block text-xs">Aktifkan Sertifikat Kelulusan?</strong><span className="text-[11px] text-slate-500">Peserta yang lulus dapat memperoleh sertifikat.</span></span><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-5 w-5" /></label><label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800"><span><strong className="block text-xs">Tampilkan Nilai Post-Test?</strong><span className="text-[11px] text-slate-500">Nilai akan dicantumkan pada sertifikat pelatihan ini.</span></span><input type="checkbox" checked={showScore} onChange={e => setShowScore(e.target.checked)} className="h-5 w-5" /></label></section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h3 className="text-sm font-bold">Penomoran Sertifikat</h3><label className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800"><span className="text-xs font-semibold">Gunakan Nomor Sertifikat?</span><input type="checkbox" checked={numbering} onChange={e => setNumbering(e.target.checked)} className="h-5 w-5" /></label>{numbering && <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800"><label className="block text-xs font-semibold">Format Nomor<input value={format} onChange={e => setFormat(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800" /></label><p className="text-[10px] text-slate-500">Placeholder: {'{NO}'}, {'{TAHUN}'}, {'{TAHUN2}'}, {'{BULAN}'}, {'{BULAN_ROMAWI}'}</p><div className="grid gap-4 sm:grid-cols-3"><label className="text-xs font-semibold">Nomor Awal<input type="number" min={1} step={1} value={start} onChange={e => setStart(Number(e.target.value))} className="mt-1 w-full rounded-xl border p-2 dark:bg-slate-800" /></label><label className="text-xs font-semibold">Jumlah Digit<input type="number" min={1} max={8} step={1} value={digits} onChange={e => setDigits(Number(e.target.value))} className="mt-1 w-full rounded-xl border p-2 dark:bg-slate-800" /></label><label className="text-xs font-semibold">Nomor Urut Saat Ini<input readOnly value={current} className="mt-1 w-full rounded-xl border bg-slate-100 p-2 font-bold text-amber-600 dark:bg-slate-800" /></label></div><div className="rounded-xl bg-slate-900 p-4 text-xs text-white"><p className="mb-2 flex items-center gap-2 font-bold text-amber-400"><Eye className="h-4 w-4" />Contoh Penomoran</p>{samples.map((s, i) => <p key={i} className="font-mono text-emerald-400">{i + 1}. {s}</p>)}</div></div>}</section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Preview Sertifikat</h3><p className="mt-0.5 text-[11px] text-slate-500">Preview mengikuti pelatihan, penomoran, nilai Post-Test, serta pengaturan direktur yang tersimpan.</p></div><ResponsiveCertificatePreview certificate={previewCertificate} settings={previewSettings} /></section>

      <button disabled={saving || switching || !trainingId} className="inline-flex items-center gap-2 rounded-xl bg-[#07375c] hover:bg-[#052c4a] px-5 py-3 text-xs font-bold text-white shadow-sm disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Pengaturan Pelatihan'}</button>
    </form>
  </div>;
}
