'use client';

import { useRouter } from 'next/navigation';
import { Bug, ChevronRight, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { SeverityBadge, StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';

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
  onRefresh: () => void;
}

/** Every bug in the project, newest first; failed runs file them automatically (UI-2). */
export function TestBugsTab({ projectId, bugs, totalCount, onRefresh }: TestBugsTabProps) {
  const router = useRouter();

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
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <ul className="divide-y divide-border">
          {bugs.map((bug) => {
            const row = (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <SeverityBadge severity={bug.severity} />
                  <p className="min-w-0 truncate text-sm font-medium">{bug.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <StatusBadge status={bug.status} />
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {new Date(bug.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {bug.test_run_id && <ChevronRight className="size-4 text-muted-foreground/60" />}
                </div>
              </>
            );
            return (
              <li key={bug.id}>
                {bug.test_run_id ? (
                  <button
                    onClick={() => router.push(`/dashboard/projects/${projectId}/runs/${bug.test_run_id}`)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                    title="Open the run that found this bug"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {totalCount > bugs.length && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {bugs.length} of {totalCount} bugs
        </p>
      )}
    </div>
  );
}
