'use client';

import { ListChecks, Pencil, Play, Sparkles, Trash2 } from 'lucide-react';
import { type TestCase } from '@qaforge/shared-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/shared/status-badge';
import { Spinner } from '@/components/shared/spinner';

interface CaseListProps {
  cases: TestCase[];
  /** The one action in flight, e.g. "run:<caseId>" or "delete-case:<caseId>". */
  busy: string | null;
  optimizingCaseId: string | null;
  onEdit: (tc: TestCase) => void;
  onDelete: (caseId: string) => void;
  onOptimize: (caseId: string) => void;
  onRun: (caseId: string) => void;
}

/** The test cases of an open suite, each with its actions. */
export function CaseList({ cases, busy, optimizingCaseId, onEdit, onDelete, onOptimize, onRun }: CaseListProps) {
  return (
    <ul className="divide-y divide-border">
      {cases.map((tc) => (
        <li key={tc.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{tc.title}</p>
              {tc.is_ai_generated && (
                <Badge variant="default" className="shrink-0">
                  <Sparkles />
                  AI optimized
                </Badge>
              )}
            </div>
            {tc.description && (
              <p className="mt-1 line-clamp-1 max-w-xl text-xs text-muted-foreground">{tc.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={tc.priority} />
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ListChecks className="size-3.5" />
                {tc.steps?.length ?? 0} steps
              </span>
              {tc.tags?.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => onEdit(tc)} aria-label={`Edit ${tc.title}`} title="Edit steps">
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(tc.id)}
              disabled={busy === `delete-case:${tc.id}`}
              aria-label={`Delete ${tc.title}`}
              title="Delete test case"
            >
              {busy === `delete-case:${tc.id}` ? <Spinner /> : <Trash2 />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOptimize(tc.id)}
              disabled={optimizingCaseId === tc.id}
              title="Rewrite the steps more clearly with AI (you review before saving)"
            >
              {optimizingCaseId === tc.id ? <Spinner /> : <Sparkles />}
              Optimize
            </Button>
            <Button size="sm" onClick={() => onRun(tc.id)} disabled={busy?.startsWith('run:')}>
              {busy === `run:${tc.id}` ? <Spinner className="text-primary-foreground" /> : <Play />}
              {busy === `run:${tc.id}` ? 'Starting…' : 'Run'}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
