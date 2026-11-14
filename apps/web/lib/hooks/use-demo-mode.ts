'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Resolved once per page load and shared across components.
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export async function resolveDemoMode(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        cached = false;
        return false;
      }
      const { data } = await supabase
        .from('profiles')
        .select('is_demo')
        .eq('id', user.id)
        .single();
      cached = Boolean(data?.is_demo);
      return cached;
    } catch {
      cached = false;
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Returns true when signed in as the read-only demo account. */
export function useDemoMode(): boolean {
  const [isDemo, setIsDemo] = useState<boolean>(cached ?? false);
  useEffect(() => {
    let mounted = true;
    resolveDemoMode().then((v) => {
      if (mounted) setIsDemo(v);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return isDemo;
}
