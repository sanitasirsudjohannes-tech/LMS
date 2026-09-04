'use client';

import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Material, Training } from '@/types';
import { Plus, Edit2, Trash2, Clock, X, Sliders, FileText, Video } from 'lucide-react';
import { getMediaType } from '@/lib/mediaUtils';

export default function MaterialsAdminPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string>('');

  const [materials, setMaterials] = useState<Material[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [minDuration, setMinDuration] = useState(15);
  const [orderNum, setOrderNum] = useState(1);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const listTr = StorageAPI.getTrainings();
        setTrainings(listTr);
        const current = StorageAPI.getTraining();
        const activeId = current ? current.id : (listTr[0]?.id || '');
        setSelectedTrainingId(activeId);
        setMaterials(activeId ? StorageAPI.getMaterials(activeId) : []);
      } catch (error) {
        setOperationError(error instanceof Error ? error.message : 'Materi gagal dimuat.');
      }
    };
    void load();
  }, []);

  const reloadMaterials = (trId?: string) => {
    const targetId = trId || selectedTrainingId;
    if (targetId) {
      const list = StorageAPI.getMaterials(targetId);
      setMaterials(list);
    }
  };

  const handleTrainingChange = async (trId: string) => {
    setSelectedTrainingId(trId);
    setOperationError('');
    try {
      await StorageAPI.loadTrainingResources(trId);
      reloadMaterials(trId);
    } catch (error) {
      setMaterials([]);
      setOperationError(error instanceof Error ? error.message : 'Materi gagal dimuat.');
    }
  };

  const handleOpenCreate = () => {
    setOperationError('');
    setEditingId(null);
    setTitle('');
    setDescription('');
    setContent('');
    setContentUrl('');
    setMinDuration(15);
    setOrderNum(Math.max(0, ...materials.map(material => material.order_number)) + 1);
    setActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: Material) => {
    setOperationError('');
    setEditingId(m.id);
    setTitle(m.title);
    setDescription(m.description || '');
    setContent(m.content);
    setContentUrl(m.content_url || '');
    setMinDuration(m.minimum_duration_seconds);
    setOrderNum(m.order_number);
    setActive(m.active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newMat: Partial<Material> = {
      id: editingId || undefined,
      training_id: selectedTrainingId,
      title: title.trim(),
      description: description.trim(),
      content: content.trim(),
      content_url: contentUrl.trim() || undefined,
      minimum_duration_seconds: Number(minDuration) || 0,
      order_number: Number(orderNum) || 1,
      active
    };

    setSaving(true);
    setOperationError('');
    try {
      await StorageAPI.saveMaterial(newMat);
      setIsModalOpen(false);
      reloadMaterials();
      await Swal.fire({
        icon: 'success',
        title: 'Materi Tersimpan',
        text: editingId ? 'Perubahan materi berhasil disimpan.' : 'Materi baru berhasil ditambahkan.',
        timer: 1800,
        showConfirmButton: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Materi gagal disimpan.';
      setOperationError(message);
      await Swal.fire('Gagal Menyimpan Materi', message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Materi?',
      text: 'Materi yang dihapus tidak dapat dipulihkan dari halaman ini.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626'
    });
    if (!result.isConfirmed) return;

    setOperationError('');
    try {
      await StorageAPI.deleteMaterial(id);
      reloadMaterials();
      await Swal.fire({ icon: 'success', title: 'Materi Terhapus', timer: 1500, showConfirmButton: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Materi gagal dihapus.';
      setOperationError(message);
      await Swal.fire('Gagal Menghapus Materi', message, 'error');
    }
  };

  const handleToggleActive = async (m: Material) => {
    setOperationError('');
    try {
      await StorageAPI.saveMaterial({ ...m, active: !m.active });
      reloadMaterials();
      await Swal.fire({
        icon: 'success',
        title: m.active ? 'Materi Dinonaktifkan' : 'Materi Diaktifkan',
        timer: 1400,
        showConfirmButton: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Status materi gagal diperbarui.';
      setOperationError(message);
      await Swal.fire('Status Materi Gagal Diperbarui', message, 'error');
    }
  };

  const selectedTrainingObj = trainings.find(t => t.id === selectedTrainingId);

  return (
    <div className="space-y-6">
      {operationError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {operationError}
        </div>
      )}
      
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Kelola Materi Pelatihan</h2>
          <p className="text-xs text-slate-500 mt-0.5">Pilih pelatihan aktif lalu atur urutan materi, konten teks/PDF/video, dan timer minimum.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Sliders className="w-4 h-4 text-slate-400 ml-2" />
            <select value={selectedTrainingId} onChange={(e) => handleTrainingChange(e.target.value)} className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none pr-2 py-1 max-w-[200px] truncate">
              {trainings.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          <button onClick={handleOpenCreate} className="px-4 py-2 bg-[#07375c] hover:bg-[#052c4a] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /><span>Tambah Materi</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {materials.length > 0 ? (
          materials.map((m) => (
            <div key={m.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">#{m.order_number}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{m.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${m.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' : 'bg-slate-100 text-slate-500'}`}>{m.active ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{m.description || m.content}</p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-2 font-mono">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" /> Durasi min: {m.minimum_duration_seconds}s</span>
                    {m.content_url && (() => {
                      const type = getMediaType(m.content_url);
                      return type === 'pdf' ? (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded"><FileText className="w-3 h-3" /> Media: PDF</span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded"><Video className="w-3 h-3" /> Media: VIDEO</span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button onClick={() => handleToggleActive(m)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100">{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button onClick={() => handleOpenEdit(m)} className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(m.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">Belum ada materi untuk pelatihan &quot;{selectedTrainingObj?.title}&quot;. Klik tombol Tambah Materi di atas untuk menambahkan.</div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 max-w-xl w-full space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{editingId ? 'Edit Materi' : `Tambah Materi (${selectedTrainingObj?.title})`}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {operationError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{operationError}</div>}
              <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Judul Materi</label><input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Materi 1: Orientasi Keselamatan" className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Deskripsi Ringkas</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ringkasan singkat materi..." className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Konten Bacaan (Teks/HTML)</label><textarea rows={6} required value={content} onChange={(e) => setContent(e.target.value)} placeholder="Tuliskan isi materi lengkap di sini..." className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-sans" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">URL Media / PDF / Video Embed (Opsional)</label><input type="url" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} placeholder="Link file PDF (misal: https://.../materi.pdf) atau URL Embed Video" className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Durasi Minimum (Detik)</label><input type="number" min={0} required value={minDuration} onChange={(e) => setMinDuration(Number(e.target.value))} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono" /></div>
                <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Urutan Tampil (#)</label><input type="number" min={1} required value={orderNum} onChange={(e) => setOrderNum(Number(e.target.value))} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-mono" /></div>
              </div>
              <div className="flex items-center gap-2 pt-2"><input type="checkbox" id="activeCheck" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded border-slate-300 text-slate-900 focus:ring-slate-900" /><label htmlFor="activeCheck" className="text-xs font-medium text-slate-700 dark:text-slate-300">Status Materi Aktif</label></div>
              <div className="pt-4 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-semibold">Batal</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-[#07375c] hover:bg-[#052c4a] text-white rounded-xl text-xs font-bold disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Materi'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
