'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { logoutFromLontar } from '@/lib/logout';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSessionReady(!!data.session);
      setSessionChecked(true);
    };
    checkSession();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setSessionReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Kata sandi minimal 8 karakter.');
      return;
    }
    if (password !== confirmation) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    try {
      await logoutFromLontar();
    } catch (logoutError) {
      console.error('Logout setelah pemulihan kata sandi gagal:', logoutError);
    } finally {
      setLoading(false);
      setSuccess(true);
      window.setTimeout(() => router.replace('/login'), 1800);
    }
  };

  return (
    <div className="lontar-auth">
      <div className="lontar-auth-panel space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Buat Kata Sandi Baru</h1>
          <p className="text-xs text-slate-500">Gunakan kata sandi yang kuat dan mudah Anda ingat.</p>
        </div>

        {success ? (
          <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-center space-y-2">
            <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Kata sandi berhasil diperbarui.</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Anda akan diarahkan ke halaman masuk.</p>
          </div>
        ) : !sessionChecked ? (
          <div className="p-4 text-center text-xs text-slate-500">Memeriksa tautan pemulihan...</div>
        ) : !sessionReady ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs text-center">
            Tautan pemulihan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset baru.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>}
            <div>
              <label htmlFor="reset-password-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Kata Sandi Baru</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input id="reset-password-password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} required minLength={8} value={password} onChange={event => setPassword(event.target.value)} className="w-full pl-9 pr-12 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
                <button type="button" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="lontar-icon-button absolute right-0 top-0 text-slate-400">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            <div>
              <label htmlFor="reset-password-confirmation" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ulangi Kata Sandi Baru</label>
              <input id="reset-password-confirmation" autoComplete="new-password" type="password" required minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 lontar-primary-action">{loading ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}</button>
          </form>
        )}

        <div className="text-center"><Link href="/login" className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline">Kembali ke Masuk</Link></div>
      </div>
    </div>
  );
}
