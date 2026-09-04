'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { StorageAPI } from '@/lib/storage';
import { Certificate } from '@/types';
import { formatDateIndonesian, formatDateInputWita } from '@/lib/utils';
import { ShieldCheck, ShieldAlert, Award, Calendar, Building, User, ArrowLeft, Clock3, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import LontarLoadingSpinner from '@/components/LontarLoadingSpinner';

export default function VerifyCertificatePage() {
  const params = useParams();
  const code = (params?.code as string) || '';

  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoadError('');
      try {
        if (code) setCertificate(await StorageAPI.findCertificateByVerificationCode(code));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Verifikasi sertifikat gagal.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [code]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center py-16">
        <LontarLoadingSpinner size="lg" text="Memverifikasi data sertifikat..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <ShieldAlert className="w-9 h-9 mx-auto mb-3" />
          <h1 className="font-bold">Verifikasi belum dapat dilakukan</h1>
          <p className="mt-1 text-xs">{loadError}</p>
        </div>
        <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white">
          Coba Lagi
        </button>
      </div>
    );
  }

  const start = certificate ? formatDateInputWita(certificate.training_start_date) : '';
  const end = certificate ? formatDateInputWita(certificate.training_end_date) : '';
  const period = certificate?.training_start_date
    ? certificate.training_end_date && start && end && start !== end
      ? `${formatDateIndonesian(certificate.training_start_date)} sampai ${formatDateIndonesian(certificate.training_end_date)}`
      : formatDateIndonesian(certificate.training_start_date)
    : null;

  return (
    <div className="max-w-xl mx-auto py-6 sm:py-10">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Utama
          </Link>

          {certificate ? (
            <div className="space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <span className="inline-block px-3 py-1 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider">
                SERTIFIKAT RESMI VALID ✓
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white pt-1">
                Verifikasi Berhasil
              </h1>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <span className="inline-block px-3 py-1 bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 rounded-full text-xs font-bold uppercase tracking-wider">
                SERTIFIKAT TIDAK DITEMUKAN
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white pt-1">
                Data Tidak Valid
              </h1>
            </div>
          )}
        </div>

        {certificate ? (
          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-sm">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block">Nama Pemilik Sertifikat</span>
                  <span className="font-bold text-slate-900 dark:text-white text-base">{certificate.user_name || '-'}</span>
                </div>
              </div>

              {certificate.user_institution && (
                <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <Building className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Instansi / Unit Kerja</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{certificate.user_institution}</span>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <Award className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block">Nama Pelatihan</span>
                  <span className="font-bold text-slate-900 dark:text-white">{certificate.training_title}</span>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <Clock3 className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block">Beban Pembelajaran</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{certificate.training_jpl || 1} Jam Pelajaran (JPL)</span>
                </div>
              </div>

              {period && (
                <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <Calendar className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Periode Pelatihan</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{period}</span>
                  </div>
                </div>
              )}

              {certificate.show_posttest_score !== false && certificate.posttest_score !== undefined && certificate.posttest_score !== null && (
                <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <GraduationCap className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Nilai Post-Test</span>
                    <span className="font-bold text-slate-900 dark:text-white">{certificate.posttest_score} / 100</span>
                  </div>
                </div>
              )}

              {certificate.certificate_number && (
                <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="w-4 font-mono text-xs font-bold text-slate-400 mt-1 text-center shrink-0">#</span>
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Nomor Sertifikat</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{certificate.certificate_number}</span>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <Calendar className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-semibold block">Tanggal Penerbitan</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{formatDateIndonesian(certificate.issued_at)}</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 text-white text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-medium">Kode Verifikasi Sistem</span>
              <span className="font-mono text-base font-bold tracking-widest text-emerald-400">{certificate.verification_code}</span>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4 pt-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Kode verifikasi <strong>&quot;{code}&quot;</strong> tidak terdaftar dalam basis data sertifikat LONTAR. Pastikan Anda memasukkan kode yang benar.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-medium"
            >
              Coba Cari Kode Lain
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
