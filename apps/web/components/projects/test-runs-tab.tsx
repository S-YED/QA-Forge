'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw, ChevronRight, Play } from 'lucide-react';
import type { TestRun } from '@qaforge/shared-types';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/shared/spinner';
import { usePending } from '@/lib/hooks/use-pending';
import { timeAgo } from '@/lib/utils';
import { isRunActive } from '@/lib/run-steps';
import { CASE_DELETED, useRunAgain } from '@/lib/hooks/use-run-again';

interface TestRunsTabProps {
  projectId: string;
  runs: (TestRun & { test_cases?: { title: string } | null })[];
  totalCount: number;
  onRefresh: (page?: number) => unknown;
  onLoadMore: () => unknown;
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function TestRunsTab({ projectId, runs, totalCount, onRefresh, onLoadMore }: TestRunsTabProps) {
  const router = useRouter();
  const { pending, track } = usePending();
  const { busy: startingAgain, runAgain } = useRunAgain(projectId);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Play}
        title="No test runs yet"
        description="Run a test case from the Suites tab to watch results stream in here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Recent runs</h3>
        <Button variant="ghost" size="sm" onClick={track('refresh', () => onRefresh(1))} disabled={!!pending}>
          {pending === 'refresh' ? <Spinner /> : <RefreshCw />}
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <ul className="divide-y divide-border">
          {runs.map((run) => (
            <li key={run.id} className="flex items-center">
              <button
                onClick={() => router.push(`/dashboard/projects/${projectId}/runs/${run.id}`)}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/40"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <StatusBadge status={run.status} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {run.test_cases?.title ||
                        run.nl_input?.substring(0, 60) ||
                        `Run ${run.id.slice(0, 8)}`}
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {run.mode === 'replay' ? 'Replay' : 'Run'} · {run.browser || 'chromium'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDuration(run.duration_ms ?? undefined)}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {timeAgo(run.created_at)}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground/60" />
                </div>
              </button>
              {/* F2: a sibling of the row button, not inside it */}
              {!isRunActive(run.status) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-2 shrink-0"
                  onClick={() => run.test_case_id && runAgain(run.test_case_id, run.id)}
                  disabled={!run.test_case_id || !!startingAgain}
                  title={run.test_case_id ? 'Run again' : CASE_DELETED}
                  aria-label={`Run ${run.test_cases?.title ?? 'this test case'} again`}
                >
                  {startingAgain === run.id ? <Spinner /> : <Play />}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {totalCount > runs.length && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Showing {runs.length} of {totalCount} runs
          </p>
          <Button variant="outline" size="sm" onClick={track('more', onLoadMore)} disabled={!!pending}>
            {pending === 'more' && <Spinner />}
            {pending === 'more' ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
