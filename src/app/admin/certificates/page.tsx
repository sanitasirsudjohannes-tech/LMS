'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Certificate } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Search, ExternalLink } from 'lucide-react';

export default function CertificatesAdminPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      setCertificates(StorageAPI.getCertificates());
    };
    load();
  }, []);

  const filtered = certificates.filter(c => {
    const name = c.user_name || '';
    const code = c.verification_code || '';
    const num = c.certificate_number || '';
    return name.toLowerCase().includes(search.toLowerCase()) ||
           code.toLowerCase().includes(search.toLowerCase()) ||
           num.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Daftar Sertifikat Diterbitkan</h2>
          <p className="text-xs text-slate-500 mt-0.5">Seluruh sertifikat peserta yang telah dinyatakan LULUS.</p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Cari nama, kode, nomor sertifikat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="p-4">Nama Peserta</th>
                <th className="p-4">Nomor Sertifikat</th>
                <th className="p-4">Kode Verifikasi</th>
                <th className="p-4 text-center">Nilai Post-Test</th>
                <th className="p-4">Tanggal Terbit</th>
                <th className="p-4 text-right">Aksi Verifikasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {filtered.length > 0 ? (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="p-4">
                      <p className="font-bold text-slate-900 dark:text-white">{c.user_name || 'Peserta'}</p>
                      <p className="text-slate-400 text-[11px]">{c.user_institution}</p>
                    </td>
                    <td className="p-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {c.certificate_number || <span className="text-slate-400 italic">Tanpa No.</span>}
                    </td>
                    <td className="p-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {c.verification_code}
                    </td>
                    <td className="p-4 text-center font-mono font-bold">{c.posttest_score}</td>
                    <td className="p-4 text-slate-500">{formatDateIndonesian(c.issued_at)}</td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/verify/${c.verification_code}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Verifikasi
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">Belum ada sertifikat diterbitkan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
