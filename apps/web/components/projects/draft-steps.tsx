import type { GeneratedTestCase } from '@qaforge/shared-types';

/** Read-only list of a draft test case's steps, for review before it is saved (AI-2). */
export function DraftSteps({ steps }: { steps: GeneratedTestCase['steps'] }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.step_number} className="flex gap-2 text-xs">
          <span className="w-5 shrink-0 text-right font-mono text-muted-foreground">{s.step_number}.</span>
          <span className="min-w-0">
            <span className="text-foreground">{s.instruction}</span>
            {(s.selector || s.value) && (
              <span className="block truncate font-mono text-muted-foreground">
                {s.action}
                {s.selector ? ` ${s.selector}` : ''}
                {s.value ? ` "${s.value}"` : ''}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
