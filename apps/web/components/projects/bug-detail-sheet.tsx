'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Bug } from '@qaforge/shared-types';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { SeverityBadge } from '@/components/shared/status-badge';
import { Spinner } from '@/components/shared/spinner';

/** Bug statuses and how they read; the Bugs tab's filter and status menu use the same list. */
export const BUG_STATUSES = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['resolved', 'Resolved'],
  ['closed', 'Closed'],
  ['wont_fix', "Won't fix"],
] as const;

/**
 * G5: one bug on its own, with what a developer asks for first: what happened, what should have, how to get
 * there, and (for a bug a run filed) the page address, console errors and failed requests (F7) and the screenshot.
 */
/** CR-6: seeded bugs store their steps as JSON ([{"step":1,"description":"..."}]); show those as numbered lines. */
function readableSteps(text: string | null | undefined): string | null | undefined {
  try {
    const steps: unknown = JSON.parse(text ?? '');
    if (Array.isArray(steps) && steps.length && steps.every((s) => typeof s?.description === 'string')) {
      return steps.map((s: { step?: number; description: string }, i) => `${s.step ?? i + 1}. ${s.description}`).join('\n');
    }
  } catch {
    // plain text, shown as written
  }
  return text;
}

export function BugDetailSheet({ projectId, bugId, onClose }: { projectId: string; bugId: string | null; onClose: () => void }) {
  const [bug, setBug] = useState<Bug | null>(null);

  useEffect(() => {
    if (!bugId) return;
    let cancelled = false;
    setBug(null);
    apiClient
      .get<{ bug: Bug }>(`/api/projects/${projectId}/bugs/${bugId}`)
      .then((data) => !cancelled && setBug(data.bug))
      .catch((err) => {
        if (cancelled) return;
        toastError('Could not open this bug', err);
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, bugId, onClose]);

  const sections: [string, string | null | undefined][] = bug
    ? [
        ['What happened', bug.actual_behavior],
        ['What should happen', bug.expected_behavior],
        ['Steps to reproduce', readableSteps(bug.steps_to_reproduce)],
        ['Details', bug.description],
      ]
    : [];

  return (
    <Sheet open={!!bugId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto p-6">
        {!bug ? (
          <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading the bug">
            <Spinner />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-2 pr-6">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={bug.severity} />
              </div>
              <SheetTitle className="break-words text-lg">{bug.title}</SheetTitle>
              <SheetDescription>
                {BUG_STATUSES.find(([value]) => value === bug.status)?.[1] ?? bug.status} · filed{' '}
                {new Date(bug.created_at).toLocaleString()}
                {(bug.occurrences ?? 1) > 1 &&
                  ` · failed ${bug.occurrences} times, last ${new Date(bug.updated_at).toLocaleString()}`}
                {bug.browser ? ` · ${bug.browser}` : ''}
              </SheetDescription>
            </SheetHeader>

            {bug.test_run_id && (
              <Button asChild variant="outline" size="sm" className="self-start">
                <Link href={`/dashboard/projects/${projectId}/runs/${bug.test_run_id}`}>
                  {(bug.occurrences ?? 1) > 1 ? 'Open the latest failing run' : 'Open the run that found it'}
                  <ArrowRight />
                </Link>
              </Button>
            )}

            <div className="space-y-5">
              {sections
                .filter(([, text]) => text && text.trim())
                .map(([label, text]) => (
                  <section key={label} className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                    <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">{text}</p>
                  </section>
                ))}
              {bug.screenshot_urls?.[0] && (
                <section className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">Screenshot</h3>
                  {/* a plain img: the address is short-lived and signed, not a static asset to optimise */}
                  <img src={bug.screenshot_urls[0]} alt={`The page when "${bug.title}" was found`} className="w-full rounded-md border" />
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
