'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw, ChevronRight, Play } from 'lucide-react';
import type { TestRun } from '@qaforge/shared-types';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';

interface TestRunsTabProps {
  projectId: string;
  runs: (TestRun & { test_cases?: { title: string } | null })[];
  totalCount: number;
  onRefresh: (page?: number) => void;
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TestRunsTab({ projectId, runs, totalCount, onRefresh }: TestRunsTabProps) {
  const router = useRouter();

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
        <Button variant="ghost" size="sm" onClick={() => onRefresh(1)}>
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <ul className="divide-y divide-border">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                onClick={() => router.push(`/dashboard/projects/${projectId}/runs/${run.id}`)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/40"
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
                      {run.mode.replace('_', ' ')} · {run.browser || 'chromium'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDuration(run.duration_ms ?? undefined)}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {formatDate(run.created_at)}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground/60" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {totalCount > runs.length && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {runs.length} of {totalCount} runs
        </p>
      )}
    </div>
  );
}
