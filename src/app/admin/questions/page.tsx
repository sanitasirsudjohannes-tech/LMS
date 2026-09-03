'use client';

import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Question, Training } from '@/types';
import { Plus, Edit2, Trash2, X, Sliders, Upload, Download, LoaderCircle } from 'lucide-react';
import {
  downloadQuestionImportTemplate,
  readQuestionImportFile,
  validateQuestionRows
} from '@/lib/questionImport';

export default function QuestionsAdminPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeTab, setActiveTab] = useState<'pretest' | 'posttest'>('pretest');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [testType, setTestType] = useState<'pretest' | 'posttest'>('pretest');
  const [questionText, setQuestionText] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState<'A' | 'B' | 'C' | 'D'>('A');
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
        if (activeId) {
          setLoadingQuestions(true);
          setQuestions(await StorageAPI.loadQuestionsForAdmin(activeId));
        }
      } catch (error) {
        setOperationError(error instanceof Error ? error.message : 'Soal gagal dimuat.');
      } finally {
        setLoadingQuestions(false);
      }
    };
    void load();
  }, []);

  const reloadQuestions = (trId?: string) => {
    const targetId = trId || selectedTrainingId;
    if (targetId) setQuestions(StorageAPI.getQuestions(undefined, targetId));
  };

  const handleTrainingChange = async (trId: string) => {
    setSelectedTrainingId(trId);
    StorageAPI.setSelectTraining(trId);
    setLoadingQuestions(true);
    setOperationError('');
    try {
      setQuestions(await StorageAPI.loadQuestionsForAdmin(trId));
    } catch (error) {
      setQuestions([]);
      setOperationError(error instanceof Error ? error.message : 'Soal gagal dimuat.');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleOpenCreate = () => {
    setOperationError('');
    setEditingId(null);
    setTestType(activeTab);
    setQuestionText('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setCorrectAnswer('A');
    setActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (q: Question) => {
    setOperationError('');
    setEditingId(q.id);
    setTestType(q.test_type);
    setQuestionText(q.question);
    setOptionA(q.option_a);
    setOptionB(q.option_b);
    setOptionC(q.option_c);
    setOptionD(q.option_d);
    setCorrectAnswer(q.correct_answer);
    setActive(q.active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newQ: Partial<Question> = {
      id: editingId || undefined,
      training_id: selectedTrainingId,
      test_type: testType,
      question: questionText.trim(),
      option_a: optionA.trim(),
      option_b: optionB.trim(),
      option_c: optionC.trim(),
      option_d: optionD.trim(),
      correct_answer: correctAnswer,
      active
    };

    setSaving(true);
    setOperationError('');
    try {
      await StorageAPI.saveQuestion(newQ);
      setIsModalOpen(false);
      reloadQuestions();
      await Swal.fire({
        icon: 'success',
        title: 'Soal Tersimpan',
        text: editingId ? 'Perubahan soal berhasil disimpan.' : 'Soal baru berhasil ditambahkan.',
        timer: 1800,
        showConfirmButton: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Soal gagal disimpan.';
      setOperationError(message);
      await Swal.fire('Gagal Menyimpan Soal', message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Soal?',
      text: 'Soal yang dihapus tidak dapat dipulihkan dari halaman ini.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626'
    });
    if (!result.isConfirmed) return;

    setOperationError('');
    try {
      await StorageAPI.deleteQuestion(id);
      reloadQuestions();
      await Swal.fire({ icon: 'success', title: 'Soal Terhapus', timer: 1500, showConfirmButton: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Soal gagal dihapus.';
      setOperationError(message);
      await Swal.fire('Gagal Menghapus Soal', message, 'error');
    }
  };

  const handleImportQuestions = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!selectedTrainingId) {
      await Swal.fire('Pilih Pelatihan', 'Pilih pelatihan tujuan sebelum mengimpor soal.', 'warning');
      return;
    }

    setIsImporting(true);
    try {
      const rows = await readQuestionImportFile(file);
      const result = validateQuestionRows(rows, questions);

      if (result.errors.length > 0) {
        const details = result.errors.slice(0, 10).map(error => `<li><b>Baris ${error.row}:</b> ${error.message}</li>`).join('');
        await Swal.fire({
          icon: 'error',
          title: 'File Belum Valid',
          html: `<p class="text-sm mb-2">Perbaiki data berikut lalu impor kembali:</p><ul class="text-left text-xs space-y-1">${details}</ul>${result.errors.length > 10 ? `<p class="text-xs mt-2">Dan ${result.errors.length - 10} kesalahan lainnya.</p>` : ''}`,
          confirmButtonText: 'Mengerti'
        });
        return;
      }

      if (result.validRows.length === 0) {
        await Swal.fire('Tidak Ada Soal Baru', 'Semua soal dalam file sudah ada atau file tidak berisi data.', 'info');
        return;
      }

      const confirmation = await Swal.fire({
        icon: 'question',
        title: 'Impor Soal?',
        html: `<p><b>${result.validRows.length}</b> soal valid akan ditambahkan ke <b>${selectedTrainingObj?.title || 'pelatihan terpilih'}</b>.</p>${result.duplicateCount > 0 ? `<p class="text-xs mt-2">${result.duplicateCount} soal duplikat akan dilewati.</p>` : ''}`,
        showCancelButton: true,
        confirmButtonText: 'Ya, Impor',
        cancelButtonText: 'Batal'
      });
      if (!confirmation.isConfirmed) return;

      await StorageAPI.saveQuestionsBulk(result.validRows, selectedTrainingId);
      reloadQuestions(selectedTrainingId);
      await Swal.fire({ icon: 'success', title: 'Impor Berhasil', text: `${result.validRows.length} soal berhasil ditambahkan.`, timer: 2200, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Impor Gagal', text: error instanceof Error ? error.message : 'File tidak dapat diproses.' });
    } finally {
      setIsImporting(false);
    }
  };

  const filteredQuestions = questions.filter(q => q.test_type === activeTab);
  const selectedTrainingObj = trainings.find(t => t.id === selectedTrainingId);

  return (
    <div className="space-y-6">
      {operationError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{operationError}</div>}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Kelola Soal Tes Pelatihan</h2><p className="text-xs text-slate-500 mt-0.5">Pilih pelatihan lalu atur soal Pre-Test & Post-Test (A, B, C, D) dan kunci jawaban.</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700"><Sliders className="w-4 h-4 text-slate-400 ml-2" /><select value={selectedTrainingId} onChange={(e) => handleTrainingChange(e.target.value)} className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none pr-2 py-1 max-w-[200px] truncate">{trainings.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"><button onClick={() => setActiveTab('pretest')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'pretest' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>Pre-Test ({questions.filter(q => q.test_type === 'pretest').length})</button><button onClick={() => setActiveTab('posttest')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === 'posttest' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>Post-Test ({questions.filter(q => q.test_type === 'posttest').length})</button></div>
          <button type="button" onClick={downloadQuestionImportTemplate} className="px-3 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"><Download className="w-4 h-4" /><span>Template</span></button>
          <label className={`px-3 py-2 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${isImporting || !selectedTrainingId ? 'opacity-50 pointer-events-none' : 'hover:bg-emerald-100 dark:hover:bg-emerald-950/70'}`}>{isImporting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}<span>{isImporting ? 'Memproses...' : 'Impor Soal'}</span><input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={handleImportQuestions} className="sr-only" disabled={isImporting || !selectedTrainingId} /></label>
          <button onClick={handleOpenCreate} disabled={!selectedTrainingId} className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-1 disabled:opacity-50"><Plus className="w-4 h-4" /><span>Tambah Soal</span></button>
        </div>
      </div>

      <div className="space-y-4">
        {loadingQuestions ? <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">Memuat soal pelatihan...</div> : filteredQuestions.length > 0 ? filteredQuestions.map((q, idx) => (
          <div key={q.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="w-7 h-7 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span><div><h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{q.question}</h3><span className="text-[10px] text-emerald-600 font-semibold font-mono uppercase">Kunci Jawaban Benar: Pilihan {q.correct_answer}</span></div></div><div className="flex items-center gap-1 shrink-0"><button onClick={() => handleOpenEdit(q)} className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(q.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Trash2 className="w-4 h-4" /></button></div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">{[{ key: 'A', text: q.option_a }, { key: 'B', text: q.option_b }, { key: 'C', text: q.option_c }, { key: 'D', text: q.option_d }].map(opt => <div key={opt.key} className={`p-2.5 rounded-xl border flex items-center gap-2 ${q.correct_answer === opt.key ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 font-semibold text-emerald-900 dark:text-emerald-200' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}><span className="w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center shrink-0">{opt.key}</span><span>{opt.text}</span></div>)}</div>
          </div>
        )) : <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">Belum ada soal {activeTab.toUpperCase()} untuk &quot;{selectedTrainingObj?.title}&quot;.</div>}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 max-w-xl w-full space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3"><h3 className="text-base font-bold text-slate-900 dark:text-white">{editingId ? 'Edit Soal' : `Tambah Soal (${selectedTrainingObj?.title})`}</h3><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSave} className="space-y-4">
              {operationError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{operationError}</div>}
              <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Jenis Tes</label><select value={testType} onChange={(e) => setTestType(e.target.value as 'pretest' | 'posttest')} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"><option value="pretest">Pre-Test</option><option value="posttest">Post-Test</option></select></div>
              <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Pertanyaan Soal</label><textarea rows={3} required value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Tuliskan pertanyaan soal..." className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
              <div className="space-y-2"><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Pilihan Jawaban</label><input type="text" required placeholder="Pilihan A" value={optionA} onChange={(e) => setOptionA(e.target.value)} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /><input type="text" required placeholder="Pilihan B" value={optionB} onChange={(e) => setOptionB(e.target.value)} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /><input type="text" required placeholder="Pilihan C" value={optionC} onChange={(e) => setOptionC(e.target.value)} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /><input type="text" required placeholder="Pilihan D" value={optionD} onChange={(e) => setOptionD(e.target.value)} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Jawaban Benar</label><select value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value as 'A' | 'B' | 'C' | 'D')} className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400"><option value="A">Pilihan A</option><option value="B">Pilihan B</option><option value="C">Pilihan C</option><option value="D">Pilihan D</option></select></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span className="text-xs">Soal aktif</span></div>
              <div className="pt-4 flex items-center justify-end gap-2"><button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-semibold">Batal</button><button type="submit" disabled={saving} className="px-5 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold">{saving ? 'Menyimpan...' : 'Simpan Soal'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
