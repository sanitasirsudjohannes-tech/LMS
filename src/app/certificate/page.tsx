'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { Certificate, CertificateSettings, UserProfile } from '@/types';
import CertificateTemplate from '@/components/CertificateTemplate';
import { generateCertificatePDF } from '@/lib/pdf';
import { Download, Printer, Share2, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

const CERTIFICATE_WIDTH = 1000;
const CERTIFICATE_HEIGHT = 707;

export default function CertificatePage() {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [settings, setSettings] = useState<CertificateSettings | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [certificateRecoveryError, setCertificateRecoveryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const user = StorageAPI.getCurrentUser();
        if (!user) {
          router.push('/login');
          return;
        }
        if (user.role === 'admin') {
          router.push('/admin/certificates');
          return;
        }
        setCurrentUser(user);

        const training = StorageAPI.getTraining();
        const selectedCertificate = StorageAPI.getSelectedCertificate();
        const selectedBelongsToUser = !!selectedCertificate && selectedCertificate.user_id === user.id;

        let cert = selectedBelongsToUser
          ? selectedCertificate
          : training
            ? StorageAPI.getCertificateForUser(user.id, training.id)
            : null;

        const passed = training && StorageAPI.getTestAttempts(user.id, 'posttest', training.id)
          .some(attempt => attempt.score >= training.passing_score);
        if (!cert && training && passed) {
          try {
            cert = await StorageAPI.ensureMyCertificate(training.id);
          } catch (error) {
            setCertificateRecoveryError(error instanceof Error ? error.message : 'Sertifikat belum dapat diterbitkan.');
          }
        }
        setCertificate(cert);

        const st = cert
          ? StorageAPI.getCertificateSnapshotSettings(cert)
          : StorageAPI.getCertificateSettings();
        setSettings(st);

        if (cert) {
          try {
            const { default: confetti } = await import('canvas-confetti');
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
          } catch {
            // Efek dekoratif tidak boleh menggagalkan tampilan sertifikat.
          }
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Sertifikat gagal dimuat.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const updateScale = () => {
      const availableWidth = Math.max(0, preview.getBoundingClientRect().width);
      const nextScale = Math.min(1, availableWidth / CERTIFICATE_WIDTH);
      setPreviewScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(preview);
    window.addEventListener('orientationchange', updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', updateScale);
    };
  }, [certificate]);

  const handleDownloadPDF = async () => {
    if (!certificate) return;
    setDownloading(true);
    try {
      const filename = `Sertifikat_${(certificate.user_name || 'Peserta').replace(/\s+/g, '_')}.pdf`;
      await generateCertificatePDF('certificate-render-target', filename);
      await Swal.fire({
        icon: 'success',
        title: 'PDF Berhasil Diunduh',
        text: 'Sertifikat telah berhasil dibuat dalam format PDF.',
        timer: 1700,
        showConfirmButton: false
      });
    } catch (err: unknown) {
      await Swal.fire(
        'Gagal Mengunduh PDF',
        err instanceof Error ? err.message : 'Terjadi kesalahan yang tidak diketahui.',
        'error'
      );
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (!certificate) return;
    const url = `${window.location.origin}/verify/${certificate.verification_code}`;
    setShareError('');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      await Swal.fire({
        icon: 'success',
        title: 'Tautan Disalin',
        text: 'Tautan verifikasi sertifikat telah disalin ke clipboard.',
        timer: 1500,
        showConfirmButton: false
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const message = 'Tautan tidak dapat disalin otomatis. Pastikan izin clipboard browser diaktifkan.';
      setCopied(false);
      setShareError(message);
      await Swal.fire('Gagal Menyalin Tautan', message, 'error');
    }
  };

  if (loadError) {
    return <div className="max-w-md mx-auto py-12 text-center text-sm text-red-700 dark:text-red-300">{loadError}</div>;
  }

  if (loading || !currentUser) {
    return <div className="max-w-md mx-auto py-12 text-center text-slate-500 text-sm">Memuat Sertifikat...</div>;
  }

  if (!certificate) {
    return (
      <div className="max-w-md mx-auto py-12">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto"><Lock className="w-7 h-7" /></div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sertifikat Belum Tersedia 🔒</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{certificateRecoveryError || 'Sertifikat digital hanya tersedia setelah Anda menyelesaikan Pre-Test, seluruh materi, dan lulus Post-Test.'}</p>
          <div className="pt-2"><Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-semibold"><ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="certificate-page w-full max-w-[1040px] mx-auto space-y-4 sm:space-y-6 py-1 sm:py-2 overflow-x-hidden">
      {shareError && <div className="certificate-screen-actions rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{shareError}</div>}

      <div className="certificate-screen-actions bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="min-w-0 w-full md:w-auto">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Sertifikat Resmi Pelatihan</span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Sertifikat Kelulusan</h1>
          <p className="text-xs text-slate-500 mt-0.5 break-all">Kode Verifikasi: <strong className="font-mono">{certificate.verification_code}</strong></p>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full md:w-auto md:min-w-[330px]">
          <button onClick={handleDownloadPDF} disabled={downloading} className="min-w-0 px-2 sm:px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-[11px] sm:text-xs transition-colors shadow-sm inline-flex items-center justify-center gap-1.5"><Download className="w-4 h-4 shrink-0" /><span className="truncate">{downloading ? 'Mengunduh...' : 'Unduh PDF'}</span></button>
          <button onClick={handlePrint} className="min-w-0 px-2 sm:px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-[11px] sm:text-xs transition-colors inline-flex items-center justify-center gap-1.5"><Printer className="w-4 h-4 shrink-0" /><span>Cetak</span></button>
          <button onClick={handleShare} className="min-w-0 px-2 sm:px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-[11px] sm:text-xs transition-colors inline-flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4 shrink-0" /><span className="truncate">{copied ? 'Disalin ✓' : 'Bagikan'}</span></button>
        </div>
      </div>

      <div className="certificate-print-area w-full p-1 sm:p-2 bg-slate-200/50 dark:bg-slate-950 rounded-lg sm:rounded-2xl border border-slate-300 dark:border-slate-800 overflow-hidden">
        <div ref={previewRef} className="certificate-preview-viewport w-full max-w-[1000px] mx-auto overflow-hidden">
          <div className="certificate-preview-stage relative mx-auto overflow-hidden" style={{ width: `${CERTIFICATE_WIDTH * previewScale}px`, height: `${CERTIFICATE_HEIGHT * previewScale}px` }}>
            <div className="certificate-preview-scale absolute left-0 top-0" style={{ width: `${CERTIFICATE_WIDTH}px`, height: `${CERTIFICATE_HEIGHT}px`, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <CertificateTemplate certificate={certificate} settings={settings || undefined} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
