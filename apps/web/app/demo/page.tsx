'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LogoMark } from '@/components/brand/logo';
import { CenteredSpinner } from '@/components/shared/spinner';
import { Button } from '@/components/ui/button';

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
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_55%_50%_at_50%_45%,black,transparent)]" />

      <div className="relative z-10 flex max-w-sm flex-col items-center text-center">
        <LogoMark className="size-14" />

        {status === 'loading' || status === 'signing-in' ? (
          <>
            <CenteredSpinner label="Signing you into the live demo…" />
            <p className="text-xs text-muted-foreground">Read-only demo · explore the full app</p>
          </>
        ) : (
          <>
            <div className="mt-6 flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">Demo unavailable</h1>
            <p className="mt-2 text-sm leading-relaxed text-destructive">{error}</p>
            <Button asChild className="mt-6">
              <Link href="/login">Sign in instead</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
