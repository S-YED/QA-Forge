'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Persistent demo mode banner displayed at the top of all dashboard pages.
 *
 * Design spec (D7):
 * - Violet background, 32px height, role="status"
 * - NOT dismissible — always visible in demo mode
 * - Shows: "Demo Mode · Read-only · Sign up for full access →"
 */
export function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function checkDemoUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_demo')
        .eq('id', user.id)
        .single();

      if (profile?.is_demo) {
        setIsDemo(true);
      }
    }
    checkDemoUser();
  }, []);

  if (!isDemo) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium border-b"
      style={{
        background: 'hsl(270 70% 50% / 0.1)',
        borderBottomColor: 'hsl(270 70% 50% / 0.2)',
        color: 'hsl(270 70% 60%)',
        height: '32px',
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
        <path d="M9 18h6" />
        <path d="M10 22h4" />
      </svg>
      <span>
        Demo Mode · Read-only sandbox ·{' '}
        <a
          href="/register"
          className="underline underline-offset-2 hover:text-violet-400 transition-colors font-semibold"
        >
          Sign up for full access →
        </a>
      </span>
    </div>
  );
}
