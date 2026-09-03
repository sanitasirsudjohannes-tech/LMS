'use client';

import { useEffect, useState } from 'react';
import CertificateAdminTabs from '@/components/CertificateAdminTabs';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Check, Save, Upload, UserRoundCog } from 'lucide-react';

export default function CertificateGeneralPage() {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [stampUrl, setStampUrl] = useState('');
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState('');
  const [stampPreview, setStampPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { void (async () => {
    try {
      await initLocalStorage();
      const s = await StorageAPI.loadGlobalCertificateSettings();
      setName(s.signatory_name); setTitle(s.signatory_title);
      setSignatureUrl(s.signatory_image_url || ''); setSignaturePreview(s.signatory_image_url || '');
      setStampUrl(s.stamp_image_url || ''); setStampPreview(s.stamp_image_url || '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Pengaturan umum gagal dimuat.'); }
  })(); }, []);

  const chooseFile = (kind: 'signature' | 'stamp', file?: File) => {
    setError(''); if (!file) return;
    if (file.type !== 'image/png') { setError(`${kind === 'signature' ? 'Tanda tangan' : 'Cap'} harus berupa PNG.`); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Ukuran file maksimal 2 MB.'); return; }
    const preview = URL.createObjectURL(file);
    if (kind === 'signature') { setSignatureFile(file); setSignaturePreview(preview); } else { setStampFile(file); setStampPreview(preview); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setMessage('');
    if (!name.trim() || !title.trim()) { setError('Nama dan jabatan direktur wajib diisi.'); return; }
    setSaving(true);
    try {
      const newSignature = signatureFile ? await StorageAPI.uploadDirectorSignature(signatureFile) : signatureUrl;
      const newStamp = stampFile ? await StorageAPI.uploadDirectorStamp(stampFile) : stampUrl;
      const saved = await StorageAPI.updateGlobalCertificateSettings({ signatory_name: name.trim(), signatory_title: title.trim(), signatory_image_url: newSignature || null, stamp_image_url: newStamp || null });
      setSignatureUrl(saved.signatory_image_url || ''); setSignaturePreview(saved.signatory_image_url || ''); setSignatureFile(null);
      setStampUrl(saved.stamp_image_url || ''); setStampPreview(saved.stamp_image_url || ''); setStampFile(null);
      setMessage('Pengaturan umum berhasil disimpan. Sertifikat lama tetap menggunakan snapshot sebelumnya.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Pengaturan umum gagal disimpan.'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-5">
    <CertificateAdminTabs />
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800"><UserRoundCog className="h-5 w-5" /></div><div><h2 className="text-lg font-bold">Pengaturan Sertifikat Umum</h2><p className="text-xs text-slate-500">Direktur, jabatan, tanda tangan, dan cap berlaku untuk semua pelatihan berikutnya.</p></div></div>
    </div>
    {message && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800"><Check className="h-4 w-4" />{message}</div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">{error}</div>}
    <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">Perubahan hanya digunakan pada sertifikat yang diterbitkan setelah pengaturan disimpan. Sertifikat lama tidak berubah.</div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold">Nama Direktur<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800" /></label><label className="text-xs font-semibold">Jabatan Direktur<input required value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800" /></label></div>
      <div className="grid gap-5 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-2">
        {[{kind:'signature' as const,label:'Tanda Tangan Direktur',preview:signaturePreview},{kind:'stamp' as const,label:'Cap Rumah Sakit',preview:stampPreview}].map(x=><div key={x.kind} className="space-y-3"><p className="text-xs font-semibold">{x.label} (PNG)</p><div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">{x.preview ? <img src={x.preview} alt={x.label} className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-slate-400">Belum ada gambar</span>}</div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold dark:border-slate-700"><Upload className="h-4 w-4" />Pilih PNG<input type="file" accept="image/png" className="hidden" onChange={e=>chooseFile(x.kind,e.target.files?.[0])} /></label></div>)}
      </div>
      <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Simpan Pengaturan Umum'}</button>
    </form>
  </div>;
}
