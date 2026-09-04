'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getValidatedCurrentUser } from '@/lib/authSession';
import { isLontarLogoutPending } from '@/lib/logout';

export function useGuestRouteGuard() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      if (isLontarLogoutPending()) {
        if (active) setCheckingSession(false);
        return;
      }

      try {
        const profile = await getValidatedCurrentUser();
        if (!active) return;

        if (!profile) {
          setCheckingSession(false);
          return;
        }

        router.replace(profile.role === 'admin' ? '/admin' : '/dashboard');
      } catch (error) {
        // Gangguan jaringan tidak boleh membuat halaman guest terkunci selamanya.
        console.error('Pengecekan sesi guest gagal:', error);
        if (active) setCheckingSession(false);
      }
    };

    void checkSession();
    return () => { active = false; };
  }, [router]);

  return checkingSession;
}
