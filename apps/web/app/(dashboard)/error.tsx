'use client';

import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard-error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight">This view failed to load</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The rest of the app is still running. Try again, or pick another project from the sidebar.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Error ID: {error.digest}</p>
        )}
        <Button onClick={reset} className="mt-6">
          Try again
        </Button>
      </div>
    </div>
  );
}
