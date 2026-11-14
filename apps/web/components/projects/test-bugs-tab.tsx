'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bug, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { usePending } from '@/lib/hooks/use-pending';
import { EmptyState } from '@/components/shared/empty-state';
import { SeverityBadge } from '@/components/shared/status-badge';
import { Spinner } from '@/components/shared/spinner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface ProjectBug {
  id: string;
  title: string;
  severity: string;
  status: string;
  test_run_id: string | null;
  created_at: string;
}

interface TestBugsTabProps {
  projectId: string;
  bugs: ProjectBug[];
  totalCount: number;
  onRefresh: () => unknown;
  onLoadMore: () => unknown;
}

const BUG_STATUSES = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['resolved', 'Resolved'],
  ['closed', 'Closed'],
  ['wont_fix', "Won't fix"],
] as const;

/** Every bug in the project, newest first; failed runs file them automatically (UI-2). */
export function TestBugsTab({ projectId, bugs, totalCount, onRefresh, onLoadMore }: TestBugsTabProps) {
  const router = useRouter();
  const { pending, track } = usePending();
  // Status changes made here, shown at once without reloading the list.
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const setStatus = async (bug: ProjectBug, status: string) => {
    setSavingId(bug.id);
    try {
      await apiClient.put(`/api/projects/${projectId}/bugs/${bug.id}`, { status });
      setStatuses((s) => ({ ...s, [bug.id]: status }));
      toast.success('Bug status updated');
    } catch (err) {
      toastError('Could not update the bug', err);
    } finally {
      setSavingId(null);
    }
  };

  if (bugs.length === 0) {
    return (
      <EmptyState
        icon={Bug}
        title="No bugs yet"
        description="When a run fails, QA Forge files a bug here with the failing step and its screenshot."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Bugs</h3>
        <Button variant="ghost" size="sm" onClick={track('refresh', onRefresh)} disabled={!!pending}>
          {pending === 'refresh' ? <Spinner /> : <RefreshCw />}
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <ul className="divide-y divide-border">
          {bugs.map((bug) => {
            const summary = (
              <>
                <SeverityBadge severity={bug.severity} />
                <p className="min-w-0 truncate text-sm font-medium">{bug.title}</p>
                <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {new Date(bug.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {bug.test_run_id && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />}
              </>
            );
            return (
              <li key={bug.id} className="flex items-center gap-3 px-4 py-2.5">
                {bug.test_run_id ? (
                  <button
                    onClick={() => router.push(`/dashboard/projects/${projectId}/runs/${bug.test_run_id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left transition-colors hover:text-primary"
                    title="Open the run that found this bug"
                  >
                    {summary}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3 py-1">{summary}</div>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  {savingId === bug.id && <Spinner />}
                  <Select
                    value={statuses[bug.id] ?? bug.status}
                    onValueChange={(v) => setStatus(bug, v)}
                    disabled={savingId === bug.id}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs" aria-label={`Status of ${bug.title}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUG_STATUSES.map(([value, label]) => (
                        <SelectItem key={value} value={value} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {totalCount > bugs.length && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Showing {bugs.length} of {totalCount} bugs
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
