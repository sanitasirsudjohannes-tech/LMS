import { supabase } from './supabase';
import { clearValidatedUser } from './authSession';

const LOGOUT_PENDING_KEY = 'lontar_logout_pending_at';
const LOGOUT_PENDING_TTL_MS = 10_000;

function isMissingSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; message?: string };
  return candidate.name === 'AuthSessionMissingError'
    || /auth session missing/i.test(candidate.message || '');
}

function clearLontarBrowserState() {
  clearValidatedUser();

  if (typeof window === 'undefined') return;

  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('lms_')) sessionStorage.removeItem(key);
  }

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('lms_')) localStorage.removeItem(key);
  }
}

function clearLogoutPending() {
  if (typeof window !== 'undefined') sessionStorage.removeItem(LOGOUT_PENDING_KEY);
}

export function isLontarLogoutPending(): boolean {
  if (typeof window === 'undefined') return false;

  const startedAt = Number(sessionStorage.getItem(LOGOUT_PENDING_KEY) || 0);
  if (!startedAt) return false;

  if (Date.now() - startedAt > LOGOUT_PENDING_TTL_MS) {
    clearLogoutPending();
    return false;
  }

  return true;
}

/**
 * UI dibersihkan secara sinkron agar langsung dapat berpindah ke login.
 * Sign-out Supabase tetap dijalankan, tetapi flag transisinya memiliki expiry
 * sehingga request jaringan yang macet tidak dapat mengunci guest guard.
 */
export async function logoutFromLontar(): Promise<void> {
  clearLontarBrowserState();

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(LOGOUT_PENDING_KEY, String(Date.now()));
    window.setTimeout(clearLogoutPending, LOGOUT_PENDING_TTL_MS);
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error && !isMissingSessionError(error)) {
      console.error('Logout Supabase gagal:', error);
    }
  } catch (error) {
    if (!isMissingSessionError(error)) {
      console.error('Logout Supabase gagal:', error);
    }
  } finally {
    clearLontarBrowserState();
    clearLogoutPending();
  }
}
