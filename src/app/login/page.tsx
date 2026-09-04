'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { markValidatedUser } from '@/lib/authSession';
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useGuestRouteGuard } from '@/hooks/useGuestRouteGuard';
import LontarLogo from '@/components/LontarLogo';

const RECENT_LOGIN_KEY = 'lms_recent_login_at';

export default function LoginPage() {
  const router = useRouter();
  const checkingSession = useGuestRouteGuard();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    router.prefetch('/admin');
    router.prefetch('/dashboard');
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        let msg = authError.message || '';
        const lower = msg.toLowerCase();

        if (
          lower.includes('invalid') ||
          lower.includes('credentials') ||
          lower.includes('grant') ||
          authError.status === 400
        ) {
          // Panggil RPC database untuk mengecek keberadaan email tanpa terhalang RLS
          const { data: isRegistered } = await supabase.rpc('check_email_exists', { p_email: email.trim() });

          if (isRegistered === false) {
            msg = 'Email belum terdaftar. Silakan daftar akun terlebih dahulu.';
          } else if (isRegistered === true) {
            msg = 'Password yang Anda masukkan salah.';
          } else {
            msg = 'Email atau password yang Anda masukkan tidak sesuai.';
          }
        } else if (lower.includes('email not confirmed')) {
          msg = 'Email Anda belum dikonfirmasi. Silakan periksa pesan konfirmasi di email Anda.';
        } else if (lower.includes('too many') || lower.includes('rate limit')) {
          msg = 'Terlalu banyak percobaan login. Silakan tunggu beberapa saat lagi.';
        } else {
          msg = `Login gagal: ${msg}`;
        }

        setError(msg);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Login gagal: tidak ada user yang dikembalikan.');
        setLoading(false);
        return;
      }

      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profileData) {
        const metadata = authData.user.user_metadata || {};
        const recoveryProfile = {
          id: authData.user.id,
          full_name: String(metadata.full_name || email.split('@')[0] || 'Peserta'),
          email: authData.user.email || email.trim(),
          institution: String(metadata.institution || ''),
          nip_nik: String(metadata.nip_nik || ''),
          phone: String(metadata.phone || ''),
          role: 'peserta' as const,
          created_at: authData.user.created_at || new Date().toISOString(),
        };
        const recovered = await supabase.from('profiles').insert(recoveryProfile).select('*').single();
        profileData = recovered.data;
        profileError = recovered.error;

        if (profileError || !profileData) {
          await supabase.auth.signOut();
          setError(`Profil pengguna tidak dapat dipulihkan: ${profileError?.message || 'data profil tidak tersedia'}. Hubungi administrator.`);
          setLoading(false);
          return;
        }
      }

      markValidatedUser(profileData);
      sessionStorage.setItem(RECENT_LOGIN_KEY, String(Date.now()));
      router.replace(profileData.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err: unknown) {
      setError(`Terjadi kesalahan: ${err instanceof Error ? err.message : 'Tidak diketahui'}`);
      setLoading(false);
    }
  };

  if (checkingSession) {
    return <div className="pt-24 text-center text-sm text-slate-500">Memeriksa sesi...</div>;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-0 py-14 sm:px-2 lg:py-20">
      <div className="grid w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden bg-[#07375c] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-sky-100">
              <ShieldCheck className="h-4 w-4" />
              Portal Pelatihan Terpadu
            </div>
            <h1 className="max-w-md text-4xl font-bold leading-tight">Belajar, evaluasi, dan akses sertifikat dalam satu sistem.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-sky-100/90">LONTAR mendukung proses pelatihan internal RSUD Prof. Dr. W.Z. Johannes Kupang secara lebih terstruktur dan mudah diakses.</p>
          </div>
          <p className="text-xs text-sky-100/70">LMS Online & Pelatihan Terpadu RSUD Johannes</p>
        </div>

        <div className="p-6 sm:p-10 lg:p-12">
          <div className="mx-auto max-w-md">
            <div className="mb-8 flex flex-col items-center text-center">
              <LontarLogo variant="full" priority className="mb-5 max-w-[210px] rounded-xl" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Masuk</h2>
              <p className="mt-2 text-sm text-slate-500">Gunakan email dan kata sandi akun Anda.</p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Alamat Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#07375c]/25 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Password</label>
                  <Link href="/forgot-password" className="text-[11px] font-medium text-slate-500 hover:text-[#07375c] dark:hover:text-sky-300">Lupa Password?</Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#07375c]/25 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#07375c] py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#052c4a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <span>Memproses...</span> : <><span>Masuk Sekarang</span><ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-5 text-center text-xs text-slate-500 dark:border-slate-800">
              Belum memiliki akun?{' '}
              <Link href="/register" className="font-semibold text-[#07375c] hover:underline dark:text-sky-300">Daftar Akun Baru</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
