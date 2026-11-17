'use client';

import Link from 'next/link';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ChecklistProject {
  id: string;
  name: string;
  /** test cases across the project's suites */
  case_count?: number;
  health?: { last_run_at: string | null } | null;
}

/**
 * U1: the three steps from a new account to a first result. Each ticks itself from real data, and the card is
 * gone once all three are done, so it never nags someone who already uses the app.
 */
export function FirstRunChecklist({ projects, onCreate }: { projects: ChecklistProject[]; onCreate: () => void }) {
  const withCases = projects.filter((p) => (p.case_count ?? 0) > 0);
  const ran = projects.some((p) => p.health?.last_run_at);
  const steps = [
    { done: projects.length > 0, title: 'Create a project', hint: 'A project is the web app you test, with its address.' },
    { done: withCases.length > 0, title: 'Add a test case', hint: 'Write the steps in plain sentences, or let AI draft them for you.' },
    { done: ran, title: 'Run it', hint: 'Watch it in a real browser, with a screenshot of every step and a bug filed if it fails.' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const next = steps.findIndex((s) => !s.done);
  // Where to go for the next step: a project without cases to add one, a project with cases to run one.
  const target = next === 1 ? (projects.find((p) => !p.case_count) ?? projects[0]) : withCases[0];

  return (
    <section aria-labelledby="first-run-title" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="first-run-title" className="text-base font-semibold text-foreground">
          Get your first test running
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {doneCount} of {steps.length} done
        </span>
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs',
                step.done ? 'border-success bg-success text-success-foreground' : 'border-border text-muted-foreground',
                i === next && 'border-primary text-primary',
              )}
              aria-hidden="true"
            >
              {step.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', step.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                {step.title}
                <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
              </p>
              {!step.done && <p className="mt-0.5 text-sm text-muted-foreground">{step.hint}</p>}
              {i === next && (
                <div className="mt-2.5">
                  {i === 0 ? (
                    // outline: the page header's "New project" is already the one primary button (DESIGN.md rule 4)
                    <Button size="sm" variant="outline" onClick={onCreate}>
                      <Plus />
                      Create project
                    </Button>
                  ) : (
                    target && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard/projects/${target.id}`}>
                          {i === 1 ? 'Add a case in' : 'Run a case in'} {target.name}
                          <ArrowRight />
                        </Link>
                      </Button>
                    )
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
