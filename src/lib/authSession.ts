import { supabase } from './supabase';
import { StorageAPI } from './storage';
import { UserProfile } from '@/types';

let validationInFlight: Promise<UserProfile | null> | null = null;
let lastValidatedAt = 0;
const VALIDATION_TTL_MS = 15_000;

function isMissingSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; message?: string };
  return candidate.name === 'AuthSessionMissingError'
    || /auth session missing/i.test(candidate.message || '');
}

export function markValidatedUser(user: UserProfile | null) {
  StorageAPI.setCurrentUser(user);
  lastValidatedAt = user ? Date.now() : 0;
}

export function clearValidatedUser() {
  markValidatedUser(null);
  validationInFlight = null;
}

export async function getValidatedCurrentUser(force = false): Promise<UserProfile | null> {
  if (typeof window === 'undefined') return null;

  const cached = StorageAPI.getCurrentUser();
  if (!force && cached && lastValidatedAt > 0 && Date.now() - lastValidatedAt < VALIDATION_TTL_MS) {
    return cached;
  }

  if (validationInFlight) return validationInFlight;

  validationInFlight = (async () => {
    const previousUser = StorageAPI.getCurrentUser();

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      if (!user) {
        clearValidatedUser();
        return null;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        clearValidatedUser();
        return null;
      }

      const validated = profile as UserProfile;
      markValidatedUser(validated);
      return validated;
    } catch (error) {
      // Tidak adanya sesi adalah kondisi logout normal, bukan error UI.
      if (isMissingSessionError(error)) {
        clearValidatedUser();
        return null;
      }

      // Error jaringan/temporer bukan bukti bahwa sesi sudah logout.
      // Pertahankan profil terakhir yang sudah pernah tervalidasi agar UI tidak
      // mendadak berubah menjadi guest. RLS Supabase tetap menjadi otorisasi akhir.
      if (previousUser) return previousUser;
      throw error;
    } finally {
      validationInFlight = null;
    }
  })();

  return validationInFlight;
}
