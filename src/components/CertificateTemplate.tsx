'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Certificate, CertificateSettings } from '@/types';
import { formatDateIndonesian } from '@/lib/utils';
import { Award, CheckCircle2 } from 'lucide-react';

interface CertificateTemplateProps {
  certificate: Certificate;
  settings?: CertificateSettings;
  previewMode?: boolean;
}

export default function CertificateTemplate({ certificate, settings, previewMode = false }: CertificateTemplateProps) {
  const showScore = settings ? settings.show_posttest_score : true;
  const signatoryName = settings?.signatory_name || 'Nama Direktur';
  const signatoryTitle = settings?.signatory_title || 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang';
  const trainingPeriod = certificate.training_start_date
    ? certificate.training_end_date && certificate.training_end_date !== certificate.training_start_date
      ? `${formatDateIndonesian(certificate.training_start_date)} sampai ${formatDateIndonesian(certificate.training_end_date)}`
      : formatDateIndonesian(certificate.training_start_date)
    : null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lms.pelatihan.id';
  const verifyUrl = `${origin}/verify/${certificate.verification_code}`;

  return (
    <div
      id="certificate-render-target"
      className={`certificate-canvas h-[707px] w-[1000px] max-w-none shrink-0 bg-white text-slate-900 relative overflow-hidden font-serif ${previewMode ? 'shadow-sm' : 'shadow-2xl'}`}
    >
      {/* Bingkai diletakkan di dalam kanvas agar tidak mepet tepi kertas A4. */}
      <div className="absolute inset-7 border-[6px] border-slate-900 pointer-events-none" />
      <div className="absolute inset-[34px] border border-slate-300 pointer-events-none" />
      <div className="absolute top-7 right-7 w-32 h-32 bg-slate-900/5 rounded-bl-full pointer-events-none" />

      {/* Konten diberi ruang aman ekstra di bawah agar QR dan blok direktur tidak menyentuh bingkai. */}
      <div className="absolute left-[54px] right-[54px] top-[50px] bottom-[66px] flex flex-col">
        {/* Header */}
        <div className="text-center space-y-2 relative z-10 shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 text-white mb-2 shadow-md">
            <Award className="w-7 h-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-widest text-slate-900 uppercase font-sans">
            Sertifikat Kelulusan
          </h1>
          <p className="text-sm tracking-wider text-slate-500 uppercase font-sans">
            Certificate of Completion
          </p>

          {certificate.certificate_number ? (
            <div className="pt-2 font-mono text-sm font-semibold tracking-wide text-slate-700">
              No: {certificate.certificate_number}
            </div>
          ) : (
            <div className="pt-1 text-[11px] font-mono text-slate-400 italic">
              [Tanpa Penomoran Sertifikat]
            </div>
          )}
        </div>

        {/* Main Body */}
        <div className="my-4 text-center space-y-2.5 relative z-10 shrink-0">
          <p className="text-sm text-slate-600 font-sans">
            Diberikan secara sah kepada:
          </p>

          <div className="py-2 border-b-2 border-slate-900 max-w-xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 tracking-wide font-sans">
              {certificate.user_name || 'Nama Peserta'}
            </h2>
            {certificate.user_institution && (
              <p className="text-sm text-slate-600 font-sans mt-1 italic">
                {certificate.user_institution}
              </p>
            )}
          </div>

          <p className="text-sm text-slate-700 leading-relaxed font-sans max-w-2xl mx-auto pt-1">
            Telah berhasil menyelesaikan seluruh rangkaian program dan dinyatakan <strong className="text-slate-900 font-bold uppercase">LULUS</strong> pada:
          </p>

          <h3 className="text-xl font-bold text-slate-900 font-sans tracking-tight max-w-3xl mx-auto">
            {certificate.training_title || 'Pelatihan Standar Pelayanan & Keselamatan Kerja'}
          </h3>

          <p className="text-sm font-semibold text-slate-700 font-sans">
            Dengan beban pembelajaran {certificate.training_jpl || 1} Jam Pelajaran (JPL)
          </p>

          {trainingPeriod && (
            <p className="text-sm text-slate-600 font-sans">
              Dilaksanakan pada {trainingPeriod}
            </p>
          )}

          {showScore && certificate.posttest_score !== undefined && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full font-sans text-xs font-semibold text-slate-700 border border-slate-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Nilai Post-Test: {certificate.posttest_score} / 100</span>
            </div>
          )}
        </div>

        {/* Footer / Signatures & QR Code */}
        <div className="mt-auto pt-3 border-t border-slate-200 grid grid-cols-2 items-end gap-6 relative z-10 font-sans shrink-0 min-h-[112px]">
          <div className="flex items-end gap-3 min-w-0">
            <div className="p-1 bg-white border border-slate-300 rounded shrink-0">
              <QRCodeSVG value={verifyUrl} size={60} level="M" />
            </div>
            <div className="pb-0.5 min-w-0">
              <span className="text-[9px] text-slate-400 block uppercase font-semibold">Kode Verifikasi</span>
              <span className="font-mono text-xs font-bold text-slate-900 tracking-wide block break-all">
                {certificate.verification_code}
              </span>
              <span className="text-[9px] text-slate-500 block mt-0.5">
                Pindai QR untuk verifikasi keaslian
              </span>
            </div>
          </div>

          <div className="text-right space-y-0.5 min-w-0">
            <p className="text-[10px] text-slate-500">Diterbitkan pada {formatDateIndonesian(certificate.issued_at)}</p>
            <div className="h-12 flex items-center justify-end">
              {settings?.signatory_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.signatory_image_url}
                  alt={`Tanda tangan ${signatoryName}`}
                  className="max-w-[160px] max-h-12 object-contain"
                />
              ) : (
                <span className="font-serif italic text-base font-bold text-slate-700 tracking-wide border-b border-slate-400 px-3">
                  {signatoryName}
                </span>
              )}
            </div>
            <p className="text-[11px] font-bold text-slate-900 leading-tight">{signatoryName}</p>
            <p className="text-[9px] leading-tight text-slate-500 max-w-[360px] ml-auto">{signatoryTitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
