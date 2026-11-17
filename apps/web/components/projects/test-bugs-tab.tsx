'use client';

import { useCallback, useState } from 'react';
import { ListFilters } from '@/components/projects/list-filters';
import { BUG_STATUSES, BugDetailSheet } from '@/components/projects/bug-detail-sheet';
import { NewBugDialog } from '@/components/projects/new-bug-dialog';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { Bug, ChevronRight, Plus, RefreshCw } from 'lucide-react';
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
  /** F6: reload the list from page 1 with these filters (a query string, "" for none). Must be stable. */
  onFilter: (query: string) => void;
  /** U1: the empty state's action, which switches to the Suites tab */
  onOpenSuites?: () => void;
}

/** Every bug in the project, newest first; failed runs file them automatically (UI-2), people file the rest (G5). */
export function TestBugsTab({ projectId, bugs, totalCount, onRefresh, onLoadMore, onFilter, onOpenSuites }: TestBugsTabProps) {
  const isDemo = useDemoMode();
  const { pending, track } = usePending();
  // G5: one bug opens on its own; a new one is filed by hand.
  const [openBugId, setOpenBugId] = useState<string | null>(null);
  const closeBug = useCallback(() => setOpenBugId(null), []);
  const [filing, setFiling] = useState(false);
  const fileBug = () =>
    isDemo
      ? toast.info('Demo is read-only', { description: 'Sign up to file bugs in your own projects.' })
      : setFiling(true);
  const dialogs = (
    <>
      <BugDetailSheet projectId={projectId} bugId={openBugId} onClose={closeBug} />
      <NewBugDialog projectId={projectId} open={filing} onClose={() => setFiling(false)} onFiled={() => void onRefresh()} />
    </>
  );
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

  // F6: the filters live here; the project page does the request.
  const [filtered, setFiltered] = useState(false);
  const applyFilter = useCallback(
    (query: string) => {
      setFiltered(!!query);
      onFilter(query);
    },
    [onFilter],
  );

  if (bugs.length === 0 && !filtered) {
    return (
      <>
        <EmptyState
          icon={Bug}
          title="No bugs yet"
          description="When a run fails, QA Forge files a bug here with the failing step and its screenshot. You can file one yourself too."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {onOpenSuites && <Button onClick={onOpenSuites}>Open suites</Button>}
              <Button variant="outline" onClick={fileBug}>
                <Plus />
                File a bug
              </Button>
            </div>
          }
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Bugs</h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={track('refresh', onRefresh)} disabled={!!pending}>
            {pending === 'refresh' ? <Spinner /> : <RefreshCw />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={fileBug}>
            <Plus />
            File a bug
          </Button>
        </div>
      </div>
      <ListFilters noun="bugs" statuses={BUG_STATUSES} search onChange={applyFilter} />

      <div className="overflow-hidden rounded-lg border bg-card">
        {bugs.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No bugs match these filters.</p>}
        <ul className="divide-y divide-border">
          {bugs.map((bug) => {
            const summary = (
              <>
                <SeverityBadge severity={bug.severity} />
                <p className="min-w-0 truncate text-sm font-medium">{bug.title}</p>
                <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {new Date(bug.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </>
            );
            return (
              <li key={bug.id} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  onClick={() => setOpenBugId(bug.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left transition-colors hover:text-primary"
                  title="Open this bug"
                >
                  {summary}
                </button>
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
      {dialogs}
    </div>
  );
}
