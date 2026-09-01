'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { StorageAPI } from '@/lib/storage';
import { UserProfile } from '@/types';

export function useGuestRouteGuard() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active) return;

      if (authError || !user) {
        setCheckingSession(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!active) return;
      if (profileError || !profile) {
        setCheckingSession(false);
        return;
      }

      const currentProfile = profile as UserProfile;
      StorageAPI.setCurrentUser(currentProfile);
      router.replace(currentProfile.role === 'admin' ? '/admin' : '/dashboard');
    };

    checkSession();
    return () => { active = false; };
  }, [router]);

  return checkingSession;
}
