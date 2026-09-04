import { supabase } from './supabase';
import { StorageAPI } from './storage';

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

/**
 * Mengakhiri sesi LONTAR secara defensif.
 *
 * State aplikasi dibersihkan sebelum dan sesudah Supabase sign-out. Pembersihan
 * kedua penting bila request data lama selesai bersamaan dengan proses logout
 * dan sempat mengisi cache pengguna kembali.
 */
export async function logoutFromLontar(): Promise<void> {
  clearLontarBrowserState();

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } finally {
    clearLontarBrowserState();
  }
}
