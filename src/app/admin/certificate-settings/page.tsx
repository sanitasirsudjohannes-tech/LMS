'use client';

import React, { useState, useEffect } from 'react';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { formatCertificateNumber } from '@/lib/utils';
import { Settings, Eye, Check, Save } from 'lucide-react';

export default function CertificateSettingsAdminPage() {
  // Form controls
  const [certificateEnabled, setCertificateEnabled] = useState(true);
  const [numberingEnabled, setNumberingEnabled] = useState(true);
  const [numberFormat, setNumberFormat] = useState('{NO}/SERT/MFK/{BULAN_ROMAWI}/{TAHUN}');
  const [startNumber, setStartNumber] = useState(1);
  const [numberDigits, setNumberDigits] = useState(4);
  const [currentNumber, setCurrentNumber] = useState(1);
  const [showPosttestScore, setShowPosttestScore] = useState(true);
  const [signatoryName, setSignatoryName] = useState('Dr. Johanes, Sp.A');
  const [signatoryTitle, setSignatoryTitle] = useState('Direktur Pelatihan');

  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const st = StorageAPI.getCertificateSettings();
      setCertificateEnabled(st.certificate_enabled);
      setNumberingEnabled(st.numbering_enabled);
      setNumberFormat(st.number_format);
      setStartNumber(st.start_number);
      setNumberDigits(st.number_digits);
      setCurrentNumber(st.current_number || st.start_number);
      setShowPosttestScore(st.show_posttest_score);
      setSignatoryName(st.signatory_name);
      setSignatoryTitle(st.signatory_title);
    };
    load();
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    StorageAPI.updateCertificateSettings({
      certificate_enabled: certificateEnabled,
      numbering_enabled: numberingEnabled,
      number_format: numberFormat.trim(),
      start_number: Number(startNumber),
      number_digits: Number(numberDigits),
      current_number: Number(currentNumber),
      show_posttest_score: showPosttestScore,
      signatory_name: signatoryName.trim(),
      signatory_title: signatoryTitle.trim()
    });

    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  // Live Preview Calculation (PRD Section 14.3 requirement)
  const previewNumberSample1 = formatCertificateNumber(numberFormat, currentNumber, numberDigits);
  const previewNumberSample2 = formatCertificateNumber(numberFormat, currentNumber + 1, numberDigits);
  const previewNumberSample3 = formatCertificateNumber(numberFormat, currentNumber + 2, numberDigits);

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

      {savedMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Pengaturan sertifikat berhasil diperbarui!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
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
                    onChange={(e) => setCurrentNumber(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-amber-600"
                  />
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
            3. Penandatangan Sertifikat
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Penandatangan
              </label>
              <input
                type="text"
                required
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                placeholder="Dr. Johanes, Sp.A"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Jabatan Penandatangan
              </label>
              <input
                type="text"
                required
                value={signatoryTitle}
                onChange={(e) => setSignatoryTitle(e.target.value)}
                placeholder="Direktur Utama Pelatihan"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white font-medium"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 text-white font-bold rounded-xl text-sm transition-all shadow-md inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Pengaturan Sertifikat</span>
          </button>
        </div>

      </form>
    </div>
  );
}
