'use client';

import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Certificate, CertificateSettings } from '@/types';
import { formatDateIndonesian, formatDateInputWita } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';

interface CertificateTemplateProps {
  certificate: Certificate;
  settings?: CertificateSettings;
  previewMode?: boolean;
}

export default function CertificateTemplate({ certificate, settings, previewMode = false }: CertificateTemplateProps) {
  const showScore = settings ? settings.show_posttest_score : true;
  const signatoryName = settings?.signatory_name || 'Nama Direktur';
  const signatoryTitle = settings?.signatory_title || 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang';
  const canvasRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    if (!previewMode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const host = canvas.parentElement;
    if (!host) return;

    // Preview admin dibungkus elemen lama yang sebelumnya mencoba menghitung
    // scale lewat CSS calc(). Matikan transform tersebut dan hitung skala dari
    // lebar container sebenarnya agar lembar 1000x707 selalu terlihat utuh.
    const previousHostTransform = host.style.transform;
    host.style.transform = 'none';

    const updateScale = () => {
      const availableWidth = host.clientWidth || host.parentElement?.clientWidth || 1000;
      setPreviewScale(Math.min(1, Math.max(0.1, availableWidth / 1000)));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    if (host.parentElement) observer.observe(host.parentElement);
    window.addEventListener('resize', updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
      host.style.transform = previousHostTransform;
    };
  }, [previewMode]);

  const trainingStartDateKey = formatDateInputWita(certificate.training_start_date);
  const trainingEndDateKey = formatDateInputWita(certificate.training_end_date);
  const isSingleDayTraining = Boolean(
    trainingStartDateKey && trainingEndDateKey && trainingStartDateKey === trainingEndDateKey
  );

  const trainingPeriod = certificate.training_start_date
    ? certificate.training_end_date && !isSingleDayTraining
      ? `${formatDateIndonesian(certificate.training_start_date)} sampai ${formatDateIndonesian(certificate.training_end_date)}`
      : formatDateIndonesian(certificate.training_start_date)
    : null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lms.pelatihan.id';
  const verifyUrl = `${origin}/verify/${certificate.verification_code}`;

  return (
    <div
      ref={canvasRef}
      id="certificate-render-target"
      className={`certificate-canvas h-[707px] w-[1000px] max-w-none shrink-0 bg-white text-slate-900 relative overflow-hidden font-serif ${previewMode ? 'shadow-sm' : 'shadow-2xl'}`}
      style={previewMode ? { transform: `scale(${previewScale})`, transformOrigin: 'top left' } : undefined}
    >
      {/* Panel biru bernuansa rumah sakit, hanya pada sisi kiri. */}
      <div
        className="absolute inset-y-0 left-0 w-[185px] overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0b3b75 0%, #1261a8 48%, #2f8fd1 100%)' }}
      >
        <div className="absolute -right-[78px] top-[-45px] h-[320px] w-[160px] rounded-[50%] border-[18px] border-white/15" />
        <div className="absolute -right-[98px] bottom-[-55px] h-[340px] w-[185px] rounded-[50%] border-[22px] border-white/10" />
        <div className="absolute inset-y-0 right-0 w-[5px] bg-white/30" />

        {/* Motif medis abstrak tanpa logo/gambar. */}
        <div className="absolute left-10 top-20 h-12 w-12 opacity-20">
          <div className="absolute left-[17px] top-0 h-12 w-[14px] rounded-sm bg-white" />
          <div className="absolute left-0 top-[17px] h-[14px] w-12 rounded-sm bg-white" />
        </div>
        <div className="absolute left-[92px] top-[162px] h-8 w-8 opacity-15">
          <div className="absolute left-[11px] top-0 h-8 w-[10px] rounded-sm bg-white" />
          <div className="absolute left-0 top-[11px] h-[10px] w-8 rounded-sm bg-white" />
        </div>
        <div className="absolute left-8 bottom-[185px] h-9 w-9 opacity-15">
          <div className="absolute left-[12px] top-0 h-9 w-[11px] rounded-sm bg-white" />
          <div className="absolute left-0 top-[12px] h-[11px] w-9 rounded-sm bg-white" />
        </div>

        <div className="absolute left-7 top-[265px] flex items-center gap-1 opacity-30">
          <span className="block h-px w-7 bg-white" />
          <span className="block h-3 w-px rotate-[35deg] bg-white" />
          <span className="block h-6 w-px -rotate-[25deg] bg-white" />
          <span className="block h-3 w-px rotate-[30deg] bg-white" />
          <span className="block h-px w-7 bg-white" />
        </div>

        <div className="absolute left-8 bottom-[86px] right-8 text-white font-sans">
          <p className="text-[10px] uppercase tracking-[0.32em] opacity-70">LMS Online</p>
          <p className="mt-1 text-lg font-bold tracking-[0.16em]">LONTAR</p>
          <div className="mt-3 h-px w-14 bg-white/60" />
          <p className="mt-3 text-[9px] leading-relaxed opacity-75">Pelatihan Terpadu<br />RSUD Johannes</p>
        </div>
      </div>

      {/* Bingkai formal mengikuti area kertas, dengan aksen biru. */}
      <div className="absolute inset-7 border-[5px] border-[#123d6a] pointer-events-none" />
      <div className="absolute inset-[34px] border border-[#8fb9db] pointer-events-none" />

      {/* Konten utama digeser ke kanan agar tidak bertabrakan dengan panel biru. */}
      <div className="absolute left-[208px] right-[54px] top-[46px] bottom-[68px] flex flex-col">
        <div className="text-center relative z-10 shrink-0 font-sans">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#315f8c]">
            RSUD Prof Dr. W.Z. Johannes Kupang
          </p>
          <div className="mx-auto mt-2 h-[3px] w-16 rounded-full bg-[#2f8fd1]" />
          <h1 className="mt-3 text-[36px] font-bold tracking-[0.16em] text-[#123d6a] uppercase">
            Sertifikat
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">Certificate of Completion</p>

          {certificate.certificate_number ? (
            <div className="mt-2 font-mono text-[11px] font-semibold tracking-wide text-slate-600">No: {certificate.certificate_number}</div>
          ) : (
            <div className="mt-2 text-[10px] font-mono text-slate-400 italic">[Tanpa Penomoran Sertifikat]</div>
          )}
        </div>

        <div className="my-3 text-center space-y-1.5 relative z-10 shrink-0">
          <p className="text-[12px] text-slate-500 font-sans">Diberikan secara sah kepada:</p>

          <div className="py-1.5 border-b-2 border-[#2f8fd1] max-w-[560px] mx-auto">
            <h2 className="text-[30px] font-bold text-[#123d6a] tracking-wide font-sans">{certificate.user_name || 'Nama Peserta'}</h2>
            {certificate.user_institution && (
              <p className="text-[12px] text-slate-600 font-sans mt-1 italic">{certificate.user_institution}</p>
            )}
          </div>

          <p className="text-[12px] text-slate-700 leading-relaxed font-sans max-w-[620px] mx-auto pt-1">
            Telah berhasil menyelesaikan seluruh rangkaian program dan dinyatakan <strong className="text-[#123d6a] font-bold uppercase">LULUS</strong> pada:
          </p>

          <h3 className="text-[18px] font-bold text-slate-900 font-sans tracking-tight max-w-[650px] mx-auto">
            {certificate.training_title || 'Pelatihan Standar Pelayanan & Keselamatan Kerja'}
          </h3>

          <p className="text-[12px] font-semibold text-slate-700 font-sans">Dengan beban pembelajaran {certificate.training_jpl || 1} Jam Pelajaran (JPL)</p>

          {trainingPeriod && <p className="text-[11px] text-slate-600 font-sans">Dilaksanakan pada {trainingPeriod}</p>}

          {showScore && certificate.posttest_score !== undefined && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#eef6fc] rounded-full font-sans text-[11px] font-semibold text-[#123d6a] border border-[#b9d8ed]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#2479b8]" />
              <span>Nilai Post-Test: {certificate.posttest_score} / 100</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-2.5 border-t border-[#d3e4f1] grid grid-cols-[0.8fr_1.2fr] items-end gap-6 relative z-10 font-sans shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1 bg-white border border-[#9fc5df] rounded shrink-0">
              <QRCodeSVG value={verifyUrl} size={54} level="M" />
            </div>
            <div className="min-w-0">
              <span className="text-[8px] text-[#47789e] block uppercase font-semibold tracking-wide">Kode Verifikasi</span>
              <span className="font-mono text-[10px] font-bold text-[#123d6a] tracking-wide block break-all leading-tight">{certificate.verification_code}</span>
              <span className="text-[8px] text-slate-500 block mt-0.5 leading-tight">Pindai QR untuk verifikasi keaslian</span>
            </div>
          </div>

          <div className="flex flex-col items-center text-center min-w-0 px-2">
            <p className="text-[12px] font-semibold text-[#315f8c] leading-tight mb-1">
              Diterbitkan pada {formatDateIndonesian(certificate.issued_at)}
            </p>
            <div className="h-[66px] w-full flex items-end justify-center -mb-2 relative">
              {settings?.stamp_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.stamp_image_url}
                  alt="Cap Direktur"
                  className="absolute z-0 left-1/2 bottom-[-22px] h-[106px] w-[106px] -translate-x-[72%] object-contain opacity-90"
                />
              )}
              {settings?.signatory_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.signatory_image_url}
                  alt={`Tanda tangan ${signatoryName}`}
                  className="relative z-10 max-w-[220px] max-h-[66px] object-contain object-center"
                />
              ) : (
                <span className="relative z-10 font-serif italic text-lg font-bold text-[#123d6a] tracking-wide px-3">{signatoryName}</span>
              )}
            </div>
            <div className="relative z-0 min-w-[240px] max-w-full">
              <p className="text-[12px] font-bold text-[#123d6a] leading-tight border-b border-[#739fc0] pb-0.5 break-words">{signatoryName}</p>
              <p className="text-[10px] leading-tight text-slate-600 mt-1 break-words">{signatoryTitle}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
