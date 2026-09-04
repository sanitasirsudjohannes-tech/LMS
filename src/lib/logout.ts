import { supabase } from './supabase';
import { StorageAPI } from './storage';

const LOGOUT_PENDING_KEY = 'lontar_logout_pending';

function clearLontarBrowserState() {
  StorageAPI.setCurrentUser(null);

  if (typeof window === 'undefined') return;

  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('lms_')) sessionStorage.removeItem(key);
  }

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('lms_')) localStorage.removeItem(key);
  }
}

export function isLontarLogoutPending(): boolean {
  return typeof window !== 'undefined' && sessionStorage.getItem(LOGOUT_PENDING_KEY) === '1';
}

/**
 * Membersihkan state lokal secara sinkron agar UI bisa langsung pindah ke login,
 * sementara sign-out Supabase diselesaikan di belakang layar. Penanda khusus
 * mencegah guest guard membaca sesi lama dan memantulkan pengguna ke dashboard.
 */
export async function logoutFromLontar(): Promise<void> {
  clearLontarBrowserState();

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(LOGOUT_PENDING_KEY, '1');
  }

  void supabase.auth.signOut()
    .then(({ error }) => {
      if (error) console.error('Logout Supabase gagal:', error);
    })
    .catch((error) => {
      console.error('Logout Supabase gagal:', error);
    })
    .finally(() => {
      clearLontarBrowserState();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(LOGOUT_PENDING_KEY);
      }
    });
}
