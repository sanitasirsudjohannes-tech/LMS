'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { markValidatedUser } from '@/lib/authSession';
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
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
    router.prefetch('/resume');
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
          const { data: isRegistered } = await supabase.rpc('check_email_exists', { p_email: email.trim() });

          if (isRegistered === false) {
            msg = 'Email belum terdaftar. Silakan daftar akun terlebih dahulu.';
          } else if (isRegistered === true) {
            msg = 'Kata sandi yang Anda masukkan salah.';
          } else {
            msg = 'Email atau kata sandi yang Anda masukkan tidak sesuai.';
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
      router.replace(profileData.role === 'admin' ? '/admin' : '/resume');
    } catch (err: unknown) {
      setError(`Terjadi kesalahan: ${err instanceof Error ? err.message : 'Tidak diketahui'}`);
      setLoading(false);
    }
  };

  if (checkingSession) {
    return <div className="pt-24 text-center text-sm text-slate-500">Memeriksa sesi...</div>;
  }

  return (
    <div className="lontar-auth">
      <div className="lontar-auth-panel space-y-6">
        <div className="text-center space-y-2">
          <LontarLogo className="mx-auto mb-3 ring-1 ring-slate-200 dark:ring-slate-700" priority />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Masuk ke LONTAR</h1>
          <p className="text-sm text-slate-500">Gunakan email dan kata sandi akun Anda.</p>
        </div>
        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Alamat Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input id="login-email" autoComplete="email"
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
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Kata Sandi</label>
              <Link href="/forgot-password" className="text-xs font-medium text-slate-500 hover:text-[#07375c] dark:hover:text-sky-300">Lupa Kata Sandi?</Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input id="login-password" autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-12 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#07375c]/25 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="lontar-icon-button absolute right-0 top-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 lontar-primary-action"
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
  );
}
