'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Stat, StatGroup } from '@/components/shared/stat';
import { StatusBadge } from '@/components/shared/status-badge';
import { timeAgo } from '@/lib/utils';

export interface CaseResult {
  test_case_id: string;
  title: string;
  suite_name: string;
  status: string;
  run_id: string;
  run_at: string;
  /** passed and failed both appear in its last 5 finished runs */
  unstable: boolean;
}

interface DayCount {
  /** YYYY-MM-DD in the viewer's timezone */
  day: string;
  passed: number;
  failed: number;
  other: number;
}

/** GET /api/projects/:id/overview. `available` is false until the database has migration 30. */
export interface ProjectOverview {
  available: boolean;
  passed_30d?: number;
  failed_30d?: number;
  runs_30d?: number;
  days?: DayCount[];
  cases?: CaseResult[];
}

/** Share of runs that passed among those that ended with a verdict; null when there are none. */
export const passRate = (passed: number, failed: number) =>
  passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null;

export const rateTone = (rate: number) => (rate >= 80 ? 'text-success' : rate >= 50 ? 'text-warning' : 'text-destructive');

const shortDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function dayLabel(d: DayCount): string {
  const parts = [
    d.passed && `${d.passed} passed`,
    d.failed && `${d.failed} failed`,
    d.other && `${d.other} with an error`,
  ].filter(Boolean);
  return `${shortDay(d.day)}: ${parts.length ? parts.join(', ') : 'no runs'}`;
}

/** 14 days of runs as stacked bars, drawn with plain boxes. Each day carries its numbers as text for screen readers. */
function DayStrip({ days }: { days: DayCount[] }) {
  const max = Math.max(1, ...days.map((d) => d.passed + d.failed + d.other));
  return (
    <div>
      <ol className="flex h-28 items-end gap-1 sm:gap-1.5" aria-label="Runs per day, last 14 days">
        {days.map((d) => {
          const total = d.passed + d.failed + d.other;
          return (
            <li key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={dayLabel(d)}>
              <span className="sr-only">{dayLabel(d)}</span>
              {total === 0 ? (
                <div className="h-px bg-border" />
              ) : (
                <div
                  className="flex flex-col gap-px overflow-hidden rounded-sm"
                  style={{ height: `${Math.max(6, (total / max) * 100)}%` }}
                  aria-hidden="true"
                >
                  {d.other > 0 && <div className="bg-warning" style={{ flex: `${d.other} 0 0` }} />}
                  {d.failed > 0 && <div className="bg-destructive" style={{ flex: `${d.failed} 0 0` }} />}
                  {d.passed > 0 && <div className="bg-success" style={{ flex: `${d.passed} 0 0` }} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
        <span>{shortDay(days[0].day)}</span>
        <span>Today</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {[
          ['bg-success', 'Passed'],
          ['bg-destructive', 'Failed'],
          ['bg-warning', 'Error or stopped'],
        ].map(([color, label]) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-sm ${color}`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CaseRows({ projectId, title, empty, cases }: { projectId: string; title: string; empty: string; cases: CaseResult[] }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card">
      <h3 className="border-b px-5 py-3.5 text-sm font-semibold text-foreground">
        {title} <span className="font-mono text-xs font-normal text-muted-foreground">{cases.length}</span>
      </h3>
      {cases.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {cases.map((c) => (
            <li key={c.test_case_id}>
              <Link
                href={`/dashboard/projects/${projectId}/runs/${c.run_id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{c.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.suite_name}, last run {timeAgo(c.run_at).toLowerCase()}
                  </span>
                </span>
                <StatusBadge status={c.status} className="shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** F5: how the project is doing. Pass rate over 30 days, runs per day for 14, and the cases that need a look. */
export function ProjectOverviewTab({
  projectId,
  overview,
  onOpenSuites,
}: {
  projectId: string;
  overview: ProjectOverview;
  /** U1: the empty state's action, which switches to the Suites tab */
  onOpenSuites?: () => void;
}) {
  if (!overview.available) {
    return (
      <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        The overview is not available yet. The database needs an update first.
      </p>
    );
  }

  const { passed_30d = 0, failed_30d = 0, runs_30d = 0, days = [], cases = [] } = overview;
  if (runs_30d === 0 && cases.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No runs yet"
        description="Run a test case or a whole suite. Pass rate, daily runs and failing cases show up here."
        action={onOpenSuites && <Button onClick={onOpenSuites}>Open suites</Button>}
      />
    );
  }

  const rate = passRate(passed_30d, failed_30d);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <section className="min-w-0 rounded-lg border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Last 30 days</h3>
          <StatGroup className="mt-4 gap-x-5 sm:gap-x-8 [&>*+*]:pl-5 sm:[&>*+*]:pl-8">
            <Stat label="Pass rate" value={rate === null ? 'None' : `${rate}%`} valueClassName={rate === null ? undefined : rateTone(rate)} />
            <Stat label="Passed" value={passed_30d} />
            <Stat label="Failed" value={failed_30d} />
            <Stat label="Runs" value={runs_30d} />
          </StatGroup>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Pass rate counts runs that ended as passed or failed. Stopped runs and errors are left out.
          </p>
        </section>

        <section className="min-w-0 rounded-lg border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Runs per day</h3>
          {days.length > 0 && <DayStrip days={days} />}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CaseRows
          projectId={projectId}
          title="Failing now"
          empty="Every case passed on its last run."
          cases={cases.filter((c) => c.status !== 'passed')}
        />
        <CaseRows
          projectId={projectId}
          title="Unstable cases"
          empty="No case has both passed and failed in its last 5 runs."
          cases={cases.filter((c) => c.unstable)}
        />
      </div>
    </div>
  );
}
