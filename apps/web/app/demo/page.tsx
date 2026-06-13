'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DemoPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'signing-in' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    async function signInAsDemo() {
      setStatus('signing-in');
      const supabase = createClient();

      // Sign out any existing session first
      await supabase.auth.signOut();

      try {
        // Call the server-side demo auth endpoint (no credentials in client bundle)
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/api/auth/demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error?.message || 'Demo sign-in failed');
        }

        const tokens = await response.json();

        // Set the session using the tokens from the server
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });

        if (sessionError) {
          throw new Error(sessionError.message);
        }

        // Redirect to dashboard
        router.push('/dashboard/projects');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Demo sign-in failed');
        setStatus('error');
      }
    }

    signInAsDemo();
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        {/* Animated logo */}
        <div className="flex justify-center mb-6">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-2xl shadow-violet-500/30 animate-pulse-glow">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>

        {status === 'loading' || status === 'signing-in' ? (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2">
              Launching Demo
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              Signing you into the live demo account...
            </p>

            {/* Progress bar */}
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ width: '60%' }} />
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Read-only demo · Explore the full app
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight mb-2 text-destructive">
              Demo Unavailable
            </h1>
            <p className="text-muted-foreground text-sm mb-6">{error}</p>
            <a
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/20 hover:bg-violet-500 transition-all duration-200"
            >
              Sign In Instead →
            </a>
          </>
        )}
      </div>
    </div>
  );
}
