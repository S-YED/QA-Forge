'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Persistent demo-mode banner shown atop every dashboard page.
 * Not dismissible - it must stay visible while in the read-only demo sandbox.
 */
export function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function checkDemoUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_demo')
        .eq('id', user.id)
        .single();

      if (profile?.is_demo) setIsDemo(true);
    }
    checkDemoUser();
  }, []);

  if (!isDemo) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-info/20 bg-info/10 px-4 py-2 text-xs font-medium text-info"
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="text-info">
        Demo mode - read-only sandbox.
      </span>
      <Link
        href="/login"
        className="inline-flex items-center gap-1 font-semibold text-info underline decoration-info/40 underline-offset-2 transition-colors hover:decoration-info"
      >
        Sign up for full access
        <ArrowRight className="size-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
