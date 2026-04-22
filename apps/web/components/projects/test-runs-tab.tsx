'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { TestRun } from '@qaforge/shared-types';

interface TestRunsTabProps {
  projectId: string;
  runs: (TestRun & { test_cases?: { title: string } | null })[];
  totalCount: number;
  onRefresh: (page?: number) => void;
}

const statusConfig: Record<string, { label: string; className: string; icon: string }> = {
  pending: { label: 'Pending', className: 'bg-slate-500/10 text-slate-500', icon: '⏳' },
  running: { label: 'Running', className: 'bg-blue-500/10 text-blue-500 animate-pulse', icon: '🔄' },
  passed: { label: 'Passed', className: 'bg-emerald-500/10 text-emerald-600', icon: '✓' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-500', icon: '✗' },
  error: { label: 'Error', className: 'bg-amber-500/10 text-amber-600', icon: '⚠' },
  skipped: { label: 'Skipped', className: 'bg-gray-500/10 text-gray-500', icon: '–' },
};

function formatDuration(ms?: number): string {
  if (!ms) return '—';
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
      <div className="rounded-lg border border-dashed p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <h3 className="font-semibold">No test runs yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Run a test case from the Test Suites tab to see results here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Recent Runs
        </h2>
        <button
          onClick={() => onRefresh(1)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="divide-y">
          {runs.map((run) => {
            const status = statusConfig[run.status] || statusConfig.pending;

            return (
              <div
                key={run.id}
                onClick={() => router.push(`/dashboard/projects/${projectId}/runs/${run.id}`)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Status badge */}
                  <span className={cn('shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', status.className)}>
                    <span className="text-[10px]">{status.icon}</span>
                    {status.label}
                  </span>

                  {/* Title / Test case name */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {run.test_cases?.title || run.nl_input?.substring(0, 60) || `Run ${run.id.slice(0, 8)}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground capitalize">{run.mode.replace('_', ' ')}</span>
                      <span className="text-[10px] text-muted-foreground">•</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{run.browser || 'chromium'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatDuration(run.duration_ms ?? undefined)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(run.created_at)}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {totalCount > runs.length && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {runs.length} of {totalCount} runs
        </p>
      )}
    </div>
  );
}
