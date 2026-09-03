'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Certificate, CertificateSettings } from '@/types';
import { formatDateIndonesian, formatDateInputWita } from '@/lib/utils';
import { CheckCircle2, Cross, HeartPulse } from 'lucide-react';

interface CertificateTemplateProps { certificate: Certificate; settings?: CertificateSettings; previewMode?: boolean; }

export default function CertificateTemplate({ certificate, settings }: CertificateTemplateProps) {
  const showScore = settings ? settings.show_posttest_score : true;
  const signatoryName = settings?.signatory_name || 'Nama Direktur';
  const signatoryTitle = settings?.signatory_title || 'Direktur RSUD Prof. Dr. W.Z. Johannes Kupang';
  const start = formatDateInputWita(certificate.training_start_date);
  const end = formatDateInputWita(certificate.training_end_date);
  const single = Boolean(start && end && start === end);
  const period = certificate.training_start_date ? (certificate.training_end_date && !single ? `${formatDateIndonesian(certificate.training_start_date)} sampai ${formatDateIndonesian(certificate.training_end_date)}` : formatDateIndonesian(certificate.training_start_date)) : null;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lmsrsudjohannes.vercel.app';
  const verifyUrl = `${origin}/verify/${certificate.verification_code}`;

  return <div id="certificate-render-target" className="certificate-canvas h-[707px] w-[1000px] max-w-none shrink-0 bg-white text-slate-900 relative overflow-hidden font-serif shadow-2xl">
    <div className="absolute inset-y-0 left-0 w-[185px] overflow-hidden" style={{background:'linear-gradient(165deg,#073b4c 0%,#0f6f78 50%,#2b9b8f 100%)'}}>
      <div className="absolute inset-y-0 right-0 w-[5px] bg-white/35"/>
      <div className="absolute -left-12 top-16 h-40 w-40 rounded-full border border-white/10"/>
      <div className="absolute left-6 top-24 h-24 w-24 rounded-full border border-white/10"/>
      <Cross className="absolute left-[48px] top-[70px] h-20 w-20 text-white/10" strokeWidth={1.5}/>
      <HeartPulse className="absolute left-[35px] top-[210px] h-28 w-28 text-white/10" strokeWidth={1.25}/>
      <div className="absolute left-7 right-7 top-[365px] flex items-center gap-2 text-white/70"><div className="h-px flex-1 bg-white/25"/><HeartPulse className="h-4 w-4"/><div className="h-px flex-1 bg-white/25"/></div>
      <div className="absolute left-11 bottom-[100px] right-6 text-white font-sans"><p className="text-[10px] uppercase tracking-[0.32em] opacity-70">LMS Online</p><p className="mt-1 text-lg font-bold tracking-[0.16em]">LONTAR</p><div className="mt-3 h-px w-14 bg-white/60"/><p className="mt-3 text-[9px] leading-relaxed opacity-80">Pelatihan Terpadu<br/>RSUD Johannes</p><p className="mt-2 text-[8px] uppercase tracking-[0.16em] text-white/60">Learning • Care • Service</p></div>
    </div>
    <div className="absolute inset-7 border-[5px] border-[#0f5268] pointer-events-none"/><div className="absolute inset-[34px] border border-[#8ccac5] pointer-events-none"/>
    <div className="absolute left-[208px] right-[54px] top-[38px] bottom-[68px] flex flex-col">
      <div className="relative z-10 shrink-0 font-sans">
        <div className="relative flex min-h-[76px] items-center justify-center border-b-2 border-[#2b8a81] pb-2 text-center">
          <img src="/logo-ntt.png" alt="Logo Pemerintah Provinsi Nusa Tenggara Timur" className="absolute left-1 top-0 h-[70px] w-[70px] object-contain"/>
          <div className="px-[82px]"><p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#2b7b79]">PEMERINTAH PROVINSI NUSA TENGGARA TIMUR</p><p className="mt-1 text-[14px] font-bold uppercase tracking-[0.08em] text-[#0f5268]">RSUD Prof. Dr. W.Z. Johannes Kupang</p></div>
        </div>
        <div className="text-center"><div className="mt-2 flex items-center justify-center gap-2"><div className="h-px w-12 bg-[#9ccfc9]"/><Cross className="h-4 w-4 text-[#2b8a81]"/><div className="h-px w-12 bg-[#9ccfc9]"/></div><h1 className="mt-0.5 text-[34px] font-bold tracking-[0.16em] text-[#0f5268] uppercase">Sertifikat</h1><p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Certificate of Completion</p>{certificate.certificate_number&&<div className="mt-1 font-mono text-[10px] font-semibold text-slate-600">No: {certificate.certificate_number}</div>}</div>
      </div>
      <div className="my-2 text-center space-y-1 relative z-10 shrink-0"><p className="text-[11px] text-slate-500 font-sans">Diberikan secara sah kepada:</p><div className="py-1 border-b-2 border-[#31a39a] max-w-[560px] mx-auto"><h2 className="text-[29px] font-bold text-[#0f5268] tracking-wide font-sans">{certificate.user_name||'Nama Peserta'}</h2></div><p className="text-[11px] text-slate-700 font-sans max-w-[620px] mx-auto pt-1">Telah berhasil menyelesaikan seluruh rangkaian program dan dinyatakan <strong className="text-[#1f8279] uppercase">LULUS</strong> pada:</p><h3 className="text-[17px] font-bold text-slate-900 font-sans max-w-[650px] mx-auto">{certificate.training_title||'Judul Pelatihan'}</h3><p className="text-[11px] font-semibold text-slate-700 font-sans">Dengan beban pembelajaran {certificate.training_jpl||1} Jam Pelajaran (JPL)</p>{period&&<p className="text-[10px] text-slate-600 font-sans">Dilaksanakan pada {period}</p>}{showScore&&certificate.posttest_score!==undefined&&<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#eef9f7] rounded-full font-sans text-[10px] font-semibold text-[#1f756f] border border-[#b7ddd8]"><CheckCircle2 className="w-3 h-3"/>Nilai Post-Test: {certificate.posttest_score} / 100</div>}</div>
      <div className="mt-auto pt-2 border-t border-[#cfe5e2] grid grid-cols-[0.8fr_1.2fr] items-end gap-6 relative z-10 font-sans shrink-0"><div className="flex items-center gap-2.5"><div className="p-1 bg-white border border-[#9acac5] rounded"><QRCodeSVG value={verifyUrl} size={54} level="M"/></div><div><span className="text-[8px] text-[#397a77] block uppercase font-semibold">Kode Verifikasi</span><span className="font-mono text-[10px] font-bold text-[#0f5268] block break-all">{certificate.verification_code}</span><span className="text-[8px] text-slate-500 block">Pindai QR untuk verifikasi keaslian</span></div></div><div className="flex flex-col items-center text-center px-2"><p className="text-[11px] font-semibold text-[#2b7b79] mb-1">Diterbitkan pada {formatDateIndonesian(certificate.issued_at)}</p><div className="h-[66px] w-full flex items-end justify-center -mb-2 relative">{settings?.stamp_image_url&&<img src={settings.stamp_image_url} alt="Cap Direktur" className="absolute z-0 left-1/2 bottom-[-22px] h-[106px] w-[106px] -translate-x-[72%] object-contain opacity-90"/>}{settings?.signatory_image_url?<img src={settings.signatory_image_url} alt={`Tanda tangan ${signatoryName}`} className="relative z-10 max-w-[220px] max-h-[66px] object-contain"/>:<span className="relative z-10 font-serif italic text-lg font-bold text-[#0f5268]">{signatoryName}</span>}</div><div className="min-w-[240px]"><p className="text-[12px] font-bold text-[#0f5268] border-b border-[#78aaa5] pb-0.5">{signatoryName}</p><p className="text-[10px] text-slate-600 mt-1">{signatoryTitle}</p></div></div></div>
    </div>
  </div>;
}