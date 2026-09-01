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
  const signatoryName = settings?.signatory_name || 'Dr. Johanes, Sp.A';
  const signatoryTitle = settings?.signatory_title || 'Direktur Pelatihan';

  // Origin for QR Code verification URL
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lms.pelatihan.id';
  const verifyUrl = `${origin}/verify/${certificate.verification_code}`;

  return (
    <div
      id="certificate-render-target"
      className="w-full max-w-4xl mx-auto bg-white text-slate-900 border-8 border-slate-900 p-8 md:p-12 relative shadow-2xl overflow-hidden font-serif"
      style={{ minHeight: '560px' }}
    >
      {/* Decorative Minimalist Border Lines */}
      <div className="absolute inset-2 border border-slate-300 pointer-events-none" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-slate-900/5 rounded-bl-full pointer-events-none" />

      {/* Header */}
      <div className="text-center space-y-2 relative z-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 text-white mb-2 shadow-md">
          <Award className="w-7 h-7" />
        </div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-widest text-slate-900 uppercase font-sans">
          Sertifikat Kelulusan
        </h1>
        <p className="text-xs md:text-sm tracking-wider text-slate-500 uppercase font-sans">
          Certificate of Completion
        </p>

        {/* Certificate Number */}
        {certificate.certificate_number ? (
          <div className="pt-2 font-mono text-xs md:text-sm font-semibold tracking-wide text-slate-700">
            No: {certificate.certificate_number}
          </div>
        ) : (
          <div className="pt-1 text-[11px] font-mono text-slate-400 italic">
            [Tanpa Penomoran Sertifikat]
          </div>
        )}
      </div>

      {/* Main Body */}
      <div className="my-8 text-center space-y-4 relative z-10">
        <p className="text-xs md:text-sm text-slate-600 font-sans">
          Diberikan secara sah kepada:
        </p>

        <div className="py-2 border-b-2 border-slate-900 max-w-xl mx-auto">
          <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-wide font-sans">
            {certificate.user_name || 'Nama Peserta'}
          </h2>
          {certificate.user_institution && (
            <p className="text-xs md:text-sm text-slate-600 font-sans mt-1 italic">
              {certificate.user_institution}
            </p>
          )}
        </div>

        <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-sans max-w-2xl mx-auto pt-2">
          Telah berhasil menyelesaikan seluruh rangkaian program dan dinyatakan <strong className="text-slate-900 font-bold uppercase">LULUS</strong> pada:
        </p>

        <h3 className="text-lg md:text-xl font-bold text-slate-900 font-sans tracking-tight max-w-2xl mx-auto">
          {certificate.training_title || 'Pelatihan Standar Pelayanan & Keselamatan Kerja'}
        </h3>

        {showScore && certificate.posttest_score !== undefined && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full font-sans text-xs font-semibold text-slate-700 border border-slate-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Nilai Post-Test: {certificate.posttest_score} / 100</span>
          </div>
        )}
      </div>

      {/* Footer / Signatures & QR Code */}
      <div className="mt-10 pt-6 border-t border-slate-200 grid grid-cols-2 items-end gap-4 relative z-10 font-sans">
        
        {/* Verification & QR Code */}
        <div className="flex items-center gap-4">
          <div className="p-1.5 bg-white border border-slate-300 rounded shadow-sm">
            <QRCodeSVG value={verifyUrl} size={72} level="M" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-semibold">Kode Verifikasi</span>
            <span className="font-mono text-xs md:text-sm font-bold text-slate-900 tracking-wider">
              {certificate.verification_code}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Pindai QR untuk verifikasi keaslian
            </span>
          </div>
        </div>

        {/* Signatory */}
        <div className="text-right space-y-1">
          <p className="text-xs text-slate-500">Diterbitkan pada {formatDateIndonesian(certificate.issued_at)}</p>
          <div className="h-12 flex items-center justify-end pr-4">
            <span className="font-serif italic text-lg font-bold text-slate-700 tracking-widest border-b border-slate-400 px-4">
              {signatoryName}
            </span>
          </div>
          <p className="text-xs font-bold text-slate-900">{signatoryName}</p>
          <p className="text-[11px] text-slate-500">{signatoryTitle}</p>
        </div>

      </div>
    </div>
  );
}
