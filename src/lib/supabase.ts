import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Konfigurasi Supabase belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY lalu deploy ulang.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Supabase mengembalikan AuthSessionMissingError saat tidak ada sesi lokal.
// Untuk aplikasi, ini adalah kondisi signed-out normal, bukan kegagalan autentikasi.
// Normalisasi di satu tempat agar semua pemanggilan auth.getUser() konsisten,
// termasuk kode lama yang masih memanggil initLocalStorage()/initCurrentUser().
const rawGetUser = supabase.auth.getUser.bind(supabase.auth);
supabase.auth.getUser = (async (...args: Parameters<typeof rawGetUser>) => {
  const result = await rawGetUser(...args);
  const message = result.error?.message || '';
  const name = result.error?.name || '';

  if (result.error && (name === 'AuthSessionMissingError' || /auth session missing/i.test(message))) {
    return { data: { user: null }, error: null };
  }

  return result;
}) as typeof supabase.auth.getUser;
