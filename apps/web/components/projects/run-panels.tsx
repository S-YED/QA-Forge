'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, Check, ChevronLeft, ChevronRight, RotateCcw, TerminalSquare, X } from 'lucide-react';
import type { TestStep } from '@qaforge/shared-types';
import { stepsToPlaywright } from '@qaforge/shared-types';
import { cn, downloadText, fileSlug } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

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
  downloadText(`${fileSlug(testTitle)}-${new Date().toISOString().slice(0, 10)}.spec.ts`, code, 'text/typescript');
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

/** A step's screenshot, ready to show: live runs send base64, saved runs a signed address. */
export interface Shot {
  step: TestStep | LiveStep;
  src: string;
}

export function screenshotsOf(steps: (TestStep | LiveStep)[]): Shot[] {
  return steps.flatMap((step) => {
    const src =
      'screenshot_base64' in step && step.screenshot_base64
        ? `data:image/png;base64,${step.screenshot_base64}`
        : ('screenshot_url' in step ? step.screenshot_url : '') || '';
    return src ? [{ step, src }] : [];
  });
}

/** "850ms", "4.2s", "1m 05s". */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s`;
}

export function ScreenshotFilmstrip({ shots, onSelect }: { shots: Shot[]; onSelect: (index: number) => void }) {
  if (shots.length === 0) {
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
      role="group"
      aria-label="Test screenshots"
    >
      {shots.map(({ step, src }, index) => {
        return (
          <button
            key={step.step_number}
            onClick={() => onSelect(index)}
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

/** U2: one screenshot at a time, with Previous and Next, the arrow keys, and Escape to close. */
export function ScreenshotViewer({
  shots,
  index,
  onIndex,
  onClose,
}: {
  shots: Shot[];
  /** null when closed */
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const shot = index === null ? null : shots[index];
  const prev = () => index !== null && index > 0 && onIndex(index - 1);
  const next = () => index !== null && index < shots.length - 1 && onIndex(index + 1);
  return (
    <Dialog open={!!shot} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl gap-3 p-4 sm:p-5"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') prev();
          if (e.key === 'ArrowRight') next();
        }}
      >
        {shot && index !== null && (
          <>
            <DialogTitle className="pr-8 text-sm font-semibold">
              Step {shot.step.step_number}: {shot.step.instruction || shot.step.action}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Screenshot {index + 1} of {shots.length}. The left and right arrow keys move between screenshots.
            </DialogDescription>
            <img
              src={shot.src}
              alt={`The page after step ${shot.step.step_number}`}
              className="max-h-[70vh] w-full rounded-md border bg-muted object-contain"
            />
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" onClick={prev} disabled={index === 0}>
                <ChevronLeft />
                Previous
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {index + 1} of {shots.length}
              </span>
              <Button variant="outline" size="sm" onClick={next} disabled={index === shots.length - 1}>
                Next
                <ChevronRight />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * U2: the result of a finished run in one sentence, with where to look next. Nothing while the run is going.
 * A run the user stopped is not a fault, so it gets a plain note instead of a red box.
 */
export function RunSummary({
  status,
  errorMessage,
  durationMs,
  steps,
  hasBug,
  editHref,
}: {
  status: string;
  errorMessage: string | null | undefined;
  durationMs: number | null | undefined;
  steps: (TestStep | LiveStep)[];
  hasBug: boolean;
  /** U3: opens the case in the editor on the project page; absent when the case was deleted. */
  editHref?: string;
}) {
  if (status === 'pending' || status === 'running') return null;
  const failed = steps.find((s) => s.status === 'failed');
  const took = durationMs != null ? ` in ${formatMs(durationMs)}` : '';

  let tone: 'success' | 'destructive' | 'warning' | 'neutral';
  let text: string;
  if (errorMessage?.startsWith('Stopped by you')) {
    tone = 'neutral';
    text = errorMessage;
  } else if (status === 'passed') {
    tone = 'success';
    text = `Passed: all ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}${took}.`;
  } else if (status === 'failed') {
    tone = 'destructive';
    const why = (failed && 'error_message' in failed && failed.error_message) || errorMessage || 'a check did not hold.';
    text = failed ? `Failed at step ${failed.step_number} of ${steps.length}: ${why}` : `Failed: ${why}`;
  } else if (status === 'error') {
    tone = 'warning';
    text = `Could not finish: ${errorMessage || 'the run ended with an error.'}`;
  } else {
    return null;
  }

  const goToStep = () => {
    const el = failed && document.getElementById(`step-${failed.step_number}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  };

  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        tone === 'success' && 'border-success/30 bg-success/8 text-success',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/8 text-destructive',
        tone === 'warning' && 'border-warning/30 bg-warning/8 text-warning',
        tone === 'neutral' && 'bg-muted text-foreground',
      )}
    >
      <p className="min-w-0 break-words font-medium">{text}</p>
      {(failed || hasBug || editHref) && tone !== 'neutral' && (
        <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1">
          {failed && (
            <button type="button" onClick={goToStep} className="font-medium underline underline-offset-2 hover:no-underline">
              Go to step {failed.step_number}
            </button>
          )}
          {hasBug && (
            <a href="#bug-reports" className="font-medium underline underline-offset-2 hover:no-underline">
              See the bug report
            </a>
          )}
          {editHref && (
            <Link href={editHref} className="font-medium underline underline-offset-2 hover:no-underline">
              Edit the test case
            </Link>
          )}
        </div>
      )}
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

interface Evidence {
  url?: string;
  console?: string[];
  requests?: string[];
}

/** F7: what the browser reported up to a failed step (page address, console errors, failed requests). */
function StepEvidence({ step }: { step: TestStep | LiveStep }) {
  const [copied, setCopied] = useState(false);
  const evidence = ('metadata' in step ? (step.metadata as { diagnostics?: Evidence } | null)?.diagnostics : undefined) ?? null;
  if (!evidence) return null;
  const consoleLines = evidence.console ?? [];
  const requests = evidence.requests ?? [];
  const error = 'error_message' in step ? step.error_message : '';
  const text = [
    `Step ${step.step_number}: ${step.instruction || step.action}`,
    error ? `Error: ${error}` : '',
    evidence.url ? `Page address: ${evidence.url}` : '',
    consoleLines.length ? `Console errors:\n${consoleLines.map((l) => `- ${l}`).join('\n')}` : '',
    requests.length ? `Failed requests:\n${requests.map((l) => `- ${l}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the text is on screen to select */
    }
  };

  return (
    <details className="mt-3 border-t border-border pt-3 pl-10 text-xs">
      <summary className="cursor-pointer select-none font-medium text-foreground">
        What the browser reported
        <span className="ml-2 font-normal text-muted-foreground">
          {consoleLines.length} console {consoleLines.length === 1 ? 'error' : 'errors'}, {requests.length} failed{' '}
          {requests.length === 1 ? 'request' : 'requests'}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        {evidence.url && (
          <div>
            <p className="text-muted-foreground">Page address</p>
            <p className="mt-0.5 break-all font-mono text-foreground">{evidence.url}</p>
          </div>
        )}
        {consoleLines.length > 0 && (
          <div>
            <p className="text-muted-foreground">Console errors</p>
            <ul className="mt-0.5 space-y-1">
              {consoleLines.map((line, i) => (
                <li key={i} className="break-words font-mono text-foreground">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
        {requests.length > 0 && (
          <div>
            <p className="text-muted-foreground">Failed requests</p>
            <ul className="mt-0.5 space-y-1">
              {requests.map((line, i) => (
                <li key={i} className="break-all font-mono text-foreground">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
        {consoleLines.length === 0 && requests.length === 0 && (
          <p className="text-muted-foreground">No console errors and no failed requests before this step failed.</p>
        )}
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-border px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-accent"
        >
          {copied ? 'Copied' : 'Copy details'}
        </button>
      </div>
    </details>
  );
}

/** The steps of a run, each with its state, timing and error. */
export function StepsTimeline({ steps, mode }: { steps: (TestStep | LiveStep)[]; mode: ViewMode }) {
  // U2: each step's time as a bar against the slowest step, so the slow one stands out.
  const durationOf = (s: TestStep | LiveStep) => ('duration_ms' in s && typeof s.duration_ms === 'number' ? s.duration_ms : undefined);
  const slowest = Math.max(0, ...steps.map((s) => durationOf(s) ?? 0));
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
              id={`step-${step.step_number}`}
              tabIndex={-1}
              className={cn(
                'scroll-mt-24 rounded-lg border bg-card p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
                  {durationOf(step) !== undefined && (
                    <span className="font-mono text-xs text-muted-foreground">{formatMs(durationOf(step)!)}</span>
                  )}
                  <StatusBadge status={step.status} showIcon={false} />
                </div>
              </div>
              {durationOf(step) !== undefined && slowest > 0 && (
                <div className="ml-10 mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className={cn('h-full rounded-full', step.status === 'failed' ? 'bg-destructive/60' : 'bg-muted-foreground/40')}
                    style={{ width: `${Math.max(2, (durationOf(step)! / slowest) * 100)}%` }}
                  />
                </div>
              )}
              <StepEvidence step={step} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
