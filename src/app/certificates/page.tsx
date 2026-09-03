'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Award, CalendarDays, ExternalLink, FileCheck2 } from 'lucide-react';
import { Certificate, UserProfile } from '@/types';
import { StorageAPI, initLocalStorage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { formatDateIndonesian } from '@/lib/utils';

export default function CertificateArchivePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        await initLocalStorage();
        const currentUser = StorageAPI.getCurrentUser();
        if (!currentUser) {
          router.push('/login');
          return;
        }
        if (currentUser.role === 'admin') {
          router.push('/admin/certificates');
          return;
        }
        setUser(currentUser);

        // Recovery seluruh sertifikat yang seharusnya sudah terbit, termasuk
        // pelatihan yang sudah diarsipkan dan tidak lagi ada di cache peserta.
        const { error: recoveryError } = await supabase.rpc('ensure_my_missing_certificates');
        if (recoveryError) {
          setLoadError(`Sebagian sertifikat belum dapat dipulihkan: ${recoveryError.message}`);
        } else {
          await initLocalStorage(true);
        }

        setCertificates(
          StorageAPI.getCertificates()
            .filter(certificate => certificate.user_id === currentUser.id)
            .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
        );
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Arsip sertifikat gagal dimuat.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const openCertificate = (certificate: Certificate) => {
    // Sertifikat dipilih berdasarkan ID dokumen. Jangan mengubah konteks pelatihan
    // karena pelatihan arsip mungkin memang tidak dapat dibaca lagi oleh peserta.
    StorageAPI.selectCertificate(certificate.id);
    router.push('/certificate');
  };

  if (loadError && !user) {
    return <div className="max-w-3xl mx-auto py-12 text-center text-sm text-red-700 dark:text-red-300">{loadError}</div>;
  }

  if (loading || !user) {
    return <div className="max-w-3xl mx-auto py-12 text-center text-sm text-slate-500">Memuat arsip sertifikat...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto py-2 space-y-6">
      {loadError && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{loadError}</div>}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
          <Award className="w-7 h-7" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider font-bold text-amber-300">Dokumen Peserta</p>
          <h1 className="text-xl sm:text-2xl font-bold">Arsip Sertifikat Saya</h1>
          <p className="text-xs text-slate-300 mt-1">Sertifikat tetap tersedia meskipun pelatihannya sudah dinonaktifkan admin.</p>
        </div>
      </div>

      {certificates.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {certificates.map(certificate => (
            <article key={certificate.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">VALID</span>
              </div>

              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{certificate.training_title || 'Pelatihan LMS'}</h2>
                <p className="text-[11px] text-slate-500 mt-1">{certificate.training_jpl || 1} Jam Pelajaran (JPL)</p>
              </div>

              <div className="text-[11px] text-slate-500 space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5" /> Diterbitkan {formatDateIndonesian(certificate.issued_at)}</p>
                <p className="font-mono">Kode: <strong>{certificate.verification_code}</strong></p>
                {certificate.certificate_number && <p className="font-mono">No: {certificate.certificate_number}</p>}
              </div>

              <button
                type="button"
                onClick={() => openCertificate(certificate)}
                className="w-full px-4 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2"
              >
                Buka & Unduh Sertifikat <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <Award className="w-10 h-10 text-slate-300 mx-auto" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Belum Ada Sertifikat</h2>
          <p className="text-xs text-slate-500">Sertifikat akan masuk ke arsip setelah Anda menyelesaikan dan lulus pelatihan.</p>
          <Link href="/dashboard" className="inline-block px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-semibold">Lihat Pelatihan Aktif</Link>
        </div>
      )}
    </div>
  );
}
