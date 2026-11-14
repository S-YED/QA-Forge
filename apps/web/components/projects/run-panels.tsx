'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, RotateCcw, TerminalSquare, X } from 'lucide-react';
import type { TestStep } from '@qaforge/shared-types';
import { stepsToPlaywright } from '@qaforge/shared-types';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';

// The display pieces of the run page: console, screenshot strip, steps list and the script download.
// The live connection and replay logic stay in run-detail-client.tsx.

export interface LiveStep {
  step_number: number;
  action: string;
  /** Human-readable description (runs after CON-1); older rows only have `action`. */
  instruction?: string | null;
  status: string;
  selector?: string;
  value?: string;
  screenshot_url?: string;
  screenshot_base64?: string;
  error_message?: string;
  duration_ms?: number;
}

// ── Code Exporter Utility ─────────────────────────────────────────────────────

export function downloadPlaywrightScript(
  steps: (TestStep | LiveStep)[],
  testTitle: string,
  baseUrl?: string,
) {
  const code = stepsToPlaywright(
    steps.map((st) => ({
      action: st.action,
      instruction: st.instruction,
      selector: 'selector' in st ? st.selector : undefined,
      value: 'value' in st ? st.value : undefined,
    })),
    testTitle,
    baseUrl,
  );
  const slug = testTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${slug}-${timestamp}.spec.ts`;

  const blob = new Blob([code], { type: 'text/typescript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Live Terminal Component ───────────────────────────────────────────────────

export interface TerminalLine {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'running' | 'system';
}

const lineColors: Record<TerminalLine['type'], string> = {
  info: 'text-console-foreground',
  success: 'text-console-success',
  error: 'text-console-error',
  running: 'text-console-info',
  system: 'text-console-accent',
};

const lineGlyph: Record<TerminalLine['type'], string> = {
  info: '·',
  success: '✓',
  error: '✗',
  running: '▶',
  system: '⚙',
};

/** live: streaming a running test. replay: re-animating a finished run's recorded results. */
export type ViewMode = 'live' | 'replay' | null;

export function LiveTerminal({ lines, mode }: { lines: TerminalLine[]; mode: ViewMode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-console-border bg-console" style={{ minHeight: '220px' }}>
      {/* Terminal chrome */}
      <div className="flex items-center gap-2 border-b border-console-border px-3.5 py-2.5">
        <TerminalSquare className="size-4 text-console-muted" aria-hidden="true" />
        <span className="font-mono text-xs text-console-muted">test-execution.log</span>
        {mode === 'live' && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-console-info">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-console-info opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-console-info" />
            </span>
            Live
          </span>
        )}
        {mode === 'replay' && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-console-muted">
            <RotateCcw className="size-3" aria-hidden="true" />
            Replay
          </span>
        )}
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-console flex-1 overflow-y-auto p-3.5 font-mono text-xs leading-relaxed"
        role="log"
        aria-live="polite"
        aria-label="Test execution log"
        style={{ maxHeight: '420px' }}
      >
        {lines.length === 0 ? (
          <div className="flex items-center gap-2 text-console-muted">
            <span className="inline-block h-3.5 w-2 animate-caret bg-console-muted" />
            <span>Waiting for test…</span>
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="flex gap-2.5 py-px">
              <span className="shrink-0 select-none text-console-muted">{line.timestamp}</span>
              <span className={cn('min-w-0 break-words', lineColors[line.type])}>
                <span className="mr-1.5 select-none opacity-90">{lineGlyph[line.type]}</span>
                {line.message}
              </span>
            </div>
          ))
        )}
        {mode !== null && lines.length > 0 && (
          <span className="mt-1 inline-block h-3.5 w-2 animate-caret bg-console-info" />
        )}
      </div>
    </div>
  );
}

// ── Screenshot Filmstrip Component ────────────────────────────────────────────

export function ScreenshotFilmstrip({
  steps,
  onSelect,
}: {
  steps: (TestStep | LiveStep)[];
  onSelect: (src: string) => void;
}) {
  const screenshotSteps = steps.filter(
    (s) =>
      ('screenshot_base64' in s && s.screenshot_base64) ||
      ('screenshot_url' in s && s.screenshot_url),
  );

  if (screenshotSteps.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-card px-4 py-8 text-sm text-muted-foreground">
        <Camera className="size-4" aria-hidden="true" />
        Screenshots appear here as the test runs.
      </div>
    );
  }

  return (
    <div
      className="scrollbar-console flex gap-3 overflow-x-auto pb-2"
      style={{ scrollSnapType: 'x mandatory' }}
      role="list"
      aria-label="Test screenshots"
    >
      {screenshotSteps.map((step) => {
        const src =
          'screenshot_base64' in step && step.screenshot_base64
            ? `data:image/png;base64,${step.screenshot_base64}`
            : ('screenshot_url' in step ? step.screenshot_url : '') || '';

        return (
          <button
            key={step.step_number}
            onClick={() => onSelect(src)}
            className="group relative shrink-0 overflow-hidden rounded-lg border bg-card transition-transform hover:-translate-y-0.5"
            style={{ scrollSnapAlign: 'start', height: '124px' }}
            aria-label={`Screenshot from step ${step.step_number}`}
          >
            <img src={src} alt={`Step ${step.step_number}`} className="h-full w-auto object-cover" />
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.625rem] font-medium text-white">
              {step.step_number}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      {children}
      {count !== undefined && (
        <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
      )}
    </h2>
  );
}

/** The steps of a run, each with its state, timing and error. */
export function StepsTimeline({ steps, mode }: { steps: (TestStep | LiveStep)[]; mode: ViewMode }) {
  return (
    <>
      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {mode === 'live' ? 'Waiting for steps to execute…' : 'No steps recorded for this run.'}
        </div>
      ) : (
        <ol className="space-y-2">
          {steps.map((step) => (
            <li
              key={step.step_number}
              className={cn(
                'rounded-lg border bg-card p-3 transition-colors',
                step.status === 'running' && 'border-info/50 bg-info/[0.04]',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      step.status === 'passed'
                        ? 'bg-success text-success-foreground'
                        : step.status === 'failed'
                          ? 'bg-destructive text-destructive-foreground'
                          : step.status === 'running'
                            ? 'bg-info text-info-foreground'
                            : step.status === 'skipped'
                              ? 'bg-muted text-muted-foreground'
                              : 'border bg-secondary text-secondary-foreground',
                    )}
                  >
                    {step.status === 'passed' ? (
                      <Check className="size-3.5" />
                    ) : step.status === 'failed' ? (
                      <X className="size-3.5" />
                    ) : (
                      step.step_number
                    )}
                  </span>

                  <div className="min-w-0">
                    <p className={cn('text-sm font-medium text-foreground', !step.instruction && 'capitalize')}>
                      {step.instruction || step.action}
                    </p>
                    {'selector' in step && step.selector && (
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {step.selector}
                      </p>
                    )}
                    {'error_message' in step && step.error_message && (
                      <p className="mt-1 text-xs text-destructive">{step.error_message}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {'duration_ms' in step && step.duration_ms !== undefined && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {step.duration_ms}ms
                    </span>
                  )}
                  <StatusBadge status={step.status} showIcon={false} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
