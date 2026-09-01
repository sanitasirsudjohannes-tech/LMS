'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
      setError('Password minimal 8 karakter.');
      return;
    }
    if (password !== confirmation) {
      setError('Konfirmasi password tidak sama.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    window.setTimeout(() => router.push('/login'), 1800);
  };

  return (
    <div className="max-w-md mx-auto py-6 sm:py-12">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Buat Password Baru</h1>
          <p className="text-xs text-slate-500">Gunakan password yang kuat dan mudah Anda ingat.</p>
        </div>

        {success ? (
          <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-center space-y-2">
            <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Password berhasil diperbarui.</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Anda akan diarahkan ke halaman login.</p>
          </div>
        ) : !sessionChecked ? (
          <div className="p-4 text-center text-xs text-slate-500">Memeriksa tautan pemulihan...</div>
        ) : !sessionReady ? (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs text-center">
            Tautan pemulihan tidak valid atau sudah kedaluwarsa. Silakan minta tautan reset baru.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password Baru</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input type={showPassword ? 'text' : 'password'} required minLength={8} value={password} onChange={event => setPassword(event.target.value)} className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
                <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-3 text-slate-400">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Ulangi Password Baru</label>
              <input type="password" required minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-sm font-bold disabled:opacity-50">{loading ? 'Menyimpan...' : 'Simpan Password Baru'}</button>
          </form>
        )}

        <div className="text-center"><Link href="/login" className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline">Kembali ke Login</Link></div>
      </div>
    </div>
  );
}
