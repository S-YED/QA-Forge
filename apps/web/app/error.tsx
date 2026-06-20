'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_55%_50%_at_50%_45%,black,transparent)]" />

      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <LogoMark className="size-12" />
        <div className="mt-8 flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          An unexpected error occurred. Your data is safe - try again or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/projects">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
