'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Certificate, CertificateSettings, UserProfile } from '@/types';
import CertificateTemplate from '@/components/CertificateTemplate';
import { generateCertificatePDF } from '@/lib/pdf';
import { Download, Printer, Share2, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function CertificatePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [settings, setSettings] = useState<CertificateSettings | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      await initLocalStorage();
      const user = StorageAPI.getCurrentUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUser(user);

      const cert = StorageAPI.getCertificateForUser(user.id);
      setCertificate(cert);

      const st = StorageAPI.getCertificateSettings();
      setSettings(st);

      if (cert) {
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch {
          // ignore
        }
      }

      setLoading(false);
    };
    load();
  }, [router]);

  const handleDownloadPDF = async () => {
    if (!certificate) return;
    setDownloading(true);
    try {
      const filename = `Sertifikat_${(certificate.user_name || 'Peserta').replace(/\s+/g, '_')}.pdf`;
      await generateCertificatePDF('certificate-render-target', filename);
    } catch (err: unknown) {
      alert('Gagal mengunduh PDF: ' + (err instanceof Error ? err.message : 'Tidak diketahui'));
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    if (!certificate) return;
    const url = `${window.location.origin}/verify/${certificate.verification_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || !currentUser) {
    return <div className="max-w-md mx-auto py-12 text-center text-slate-500 text-sm">Memuat Sertifikat...</div>;
  }

  if (!certificate) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sertifikat Belum Tersedia 🔒</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Sertifikat digital hanya tersedia setelah Anda menyelesaikan Pre-Test, seluruh materi, dan lulus Post-Test.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2">
      
      {/* Top Header & Actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Sertifikat Resmi Pelatihan
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Sertifikat Kelulusan</h1>
          <p className="text-xs text-slate-500 mt-0.5">Kode Verifikasi: <strong className="font-mono">{certificate.verification_code}</strong></p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex-1 md:flex-none px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition-colors shadow-sm inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Mengunduh...' : 'Unduh PDF'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-xs transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak</span>
          </button>

          <button
            onClick={handleShare}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-xs transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            <span>{copied ? 'Tautan Disalin! ✓' : 'Bagikan Link'}</span>
          </button>
        </div>
      </div>

      {/* Certificate Live Preview Render Target */}
      <div className="overflow-x-auto p-2 bg-slate-200/50 dark:bg-slate-950 rounded-2xl border border-slate-300 dark:border-slate-800">
        <CertificateTemplate certificate={certificate} settings={settings || undefined} />
      </div>

    </div>
  );
}
