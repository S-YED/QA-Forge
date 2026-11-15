'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight, Square } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { isRunActive } from '@/lib/run-steps';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Spinner } from '@/components/shared/spinner';
import { Stat, StatGroup } from '@/components/shared/stat';
import { RunDetailSkeleton } from '@/components/shared/page-skeletons';

interface BatchResponse {
  batch: { id: string; suite_id: string | null; created_at: string; test_suites: { name: string } | null };
  runs: {
    id: string;
    status: string;
    duration_ms: number | null;
    error_message: string | null;
    test_cases: { title: string } | null;
  }[];
  counts: { total: number; pending: number; running: number; passed: number; failed: number; error: number };
}

const formatDuration = (ms: number | null) => (ms == null ? '' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

/** F3: one suite run. Every case with its live status, the totals, and a way to stop what is left. */
export function BatchDetailClient({ projectId, batchId }: { projectId: string; batchId: string }) {
  const router = useRouter();
  const [data, setData] = useState<BatchResponse | null>(null);
  const [stopping, setStopping] = useState(false);
  const path = `/api/projects/${projectId}/run-batches/${batchId}`;

  const load = useCallback(() => apiClient.get<BatchResponse>(path), [path]);

  const active = data ? data.counts.pending + data.counts.running > 0 : true;

  // First load, then a reload every 2 s while any case is still pending or running.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async (first: boolean) => {
      try {
        const next = await load();
        if (cancelled) return;
        setData(next);
        if (next.counts.pending + next.counts.running > 0) timer = setTimeout(() => tick(false), 2000);
      } catch (err) {
        if (cancelled) return;
        if (first) {
          toastError('Could not open this suite run', err);
          router.push(`/dashboard/projects/${projectId}`);
        } else {
          timer = setTimeout(() => tick(false), 4000); // a blip: keep watching, less often
        }
      }
    };
    void tick(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, projectId, router]);

  const stopAll = async () => {
    setStopping(true);
    try {
      await apiClient.post(`${path}/cancel`, {});
      setData(await load());
    } catch (err) {
      toastError('Could not stop the suite run', err);
    } finally {
      setStopping(false);
    }
  };

  if (!data) return <RunDetailSkeleton />;

  const { counts, runs } = data;
  const finished = counts.total - counts.pending - counts.running;
  const suiteName = data.batch.test_suites?.name ?? 'Deleted suite';

  return (
    <div className="space-y-7">
      <div>
        <button
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to project
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Suite run: {suiteName}</h1>
            <p className="text-sm text-muted-foreground" role="status">
              {active ? `Running, ${finished} of ${counts.total} finished` : `Finished, ${counts.total} ${counts.total === 1 ? 'case' : 'cases'}`}
            </p>
          </div>
          {active && (
            <Button variant="outline" onClick={stopAll} disabled={stopping} aria-label="Stop this suite run">
              {stopping ? <Spinner /> : <Square />}
              {stopping ? 'Stopping…' : 'Stop all'}
            </Button>
          )}
        </div>
      </div>

      <StatGroup className="flex-nowrap gap-x-5 sm:gap-x-8 [&>*+*]:pl-5 sm:[&>*+*]:pl-8">
        <Stat label="Passed" value={counts.passed} valueClassName="text-success" />
        <Stat label="Failed" value={counts.failed} valueClassName="text-destructive" />
        <Stat label="Errors" value={counts.error} valueClassName="text-warning" />
        <Stat label="Waiting" value={counts.pending + counts.running} />
      </StatGroup>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          Test cases
          <span className="font-mono text-xs font-normal text-muted-foreground">{counts.total}</span>
        </h2>
        <ol className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
          {runs.map((run, i) => (
            <li key={run.id}>
              <Link
                href={`/dashboard/projects/${projectId}/runs/${run.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  {/* phone: the title may take two lines; wider screens keep one */}
                  <span className="line-clamp-2 text-sm font-medium text-foreground sm:line-clamp-1">
                    {run.test_cases?.title ?? 'Deleted test case'}
                  </span>
                  {run.error_message && !isRunActive(run.status) && (
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1">{run.error_message}</span>
                  )}
                </span>
                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                  {formatDuration(run.duration_ms)}
                </span>
                <StatusBadge status={run.status} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
