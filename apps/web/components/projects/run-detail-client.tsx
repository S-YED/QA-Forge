'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  RotateCcw,
  TerminalSquare,
  Bug,
  X,
  Check,
  Camera,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { TestRun, TestStep } from '@qaforge/shared-types';
import { TestRunStatus } from '@qaforge/shared-types';
import { io as socketIO, type Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { StatusBadge, SeverityBadge } from '@/components/shared/status-badge';
import { CenteredSpinner } from '@/components/shared/spinner';

interface RunDetailResponse {
  test_run: TestRun & {
    test_cases?: { title: string; steps: unknown[] } | null;
    projects?: { base_url: string } | null;
  };
  steps: TestStep[];
  bugs: { id: string; title: string; severity: string; status: string }[];
}

// Cancellable delay for the scripted replay. Rejects when `signal.cancelled`
// flips true (set on unmount / re-run) so a navigated-away replay stops cleanly.
function sleep(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (signal.cancelled) return reject(new Error('cancelled'));
      if (Date.now() - start >= ms) return resolve();
      setTimeout(tick, Math.min(80, ms));
    };
    tick();
  });
}

// Map a real step duration to a watchable replay delay (fast enough to feel
// live, slow enough to read). Skipped steps get a short beat.
function replayDelay(durationMs?: number): number {
  if (!durationMs || durationMs <= 0) return 280;
  return Math.min(Math.max(durationMs, 350), 1400);
}

interface LiveStep {
  step_number: number;
  action: string;
  status: string;
  selector?: string;
  value?: string;
  screenshot_url?: string;
  screenshot_base64?: string;
  error_message?: string;
  duration_ms?: number;
}

// ── Code Exporter Utility ─────────────────────────────────────────────────────

function generatePlaywrightCode(
  steps: (TestStep | LiveStep)[],
  testTitle: string,
  baseUrl?: string,
): string {
  const lines: string[] = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test('${testTitle.replace(/'/g, "\\'")}', async ({ page }) => {`,
  ];

  for (const step of steps) {
    const action = step.action;
    const selector = 'selector' in step ? step.selector : undefined;
    const value = 'value' in step ? step.value : undefined;

    switch (action) {
      case 'navigate':
        lines.push(`  await page.goto('${baseUrl || ''}${value || '/'}');`);
        break;
      case 'fill':
        lines.push(`  await page.locator('${selector}').fill('${value || ''}');`);
        break;
      case 'click':
        lines.push(`  await page.locator('${selector}').click();`);
        break;
      case 'assert':
        if (value === 'visible') {
          lines.push(`  await expect(page.locator('${selector}')).toBeVisible();`);
        } else {
          lines.push(`  await expect(page.locator('${selector}')).toHaveText('${value || ''}');`);
        }
        break;
      case 'wait':
        lines.push(`  await page.waitForTimeout(${value || '1000'});`);
        break;
      default:
        lines.push(`  // ${action}: ${selector || ''} ${value || ''}`);
    }
  }

  lines.push(`});`);
  lines.push(``);
  return lines.join('\n');
}

function downloadPlaywrightScript(
  steps: (TestStep | LiveStep)[],
  testTitle: string,
  baseUrl?: string,
) {
  const code = generatePlaywrightCode(steps, testTitle, baseUrl);
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

interface TerminalLine {
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

function LiveTerminal({ lines, isLive }: { lines: TerminalLine[]; isLive: boolean }) {
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
        {isLive && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-console-info">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-console-info opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-console-info" />
            </span>
            Live
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
              <span className="shrink-0 select-none text-console-muted/70">{line.timestamp}</span>
              <span className={cn('min-w-0 break-words', lineColors[line.type])}>
                <span className="mr-1.5 select-none opacity-90">{lineGlyph[line.type]}</span>
                {line.message}
              </span>
            </div>
          ))
        )}
        {isLive && lines.length > 0 && (
          <span className="mt-1 inline-block h-3.5 w-2 animate-caret bg-console-info" />
        )}
      </div>
    </div>
  );
}

// ── Screenshot Filmstrip Component ────────────────────────────────────────────

function ScreenshotFilmstrip({
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

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      {children}
      {count !== undefined && (
        <span className="font-mono text-xs font-normal text-muted-foreground">{count}</span>
      )}
    </h2>
  );
}

// ── Main Run Detail Component ─────────────────────────────────────────────────

export function RunDetailClient({ projectId, runId }: { projectId: string; runId: string }) {
  const router = useRouter();
  const [run, setRun] = useState<RunDetailResponse['test_run'] | null>(null);
  const [steps, setSteps] = useState<(TestStep | LiveStep)[]>([]);
  const [bugs, setBugs] = useState<RunDetailResponse['bugs']>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [canReplay, setCanReplay] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  // Holds the full, ordered final steps so the Replay button can re-animate.
  const allStepsRef = useRef<(TestStep | LiveStep)[]>([]);
  // Cancellation token for an in-flight scripted replay.
  const replaySignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const addTerminalLine = useCallback(
    (message: string, type: TerminalLine['type'] = 'info') => {
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setTerminalLines((prev) => [...prev, { timestamp, message, type }]);
    },
    [],
  );

  // Scripted live-replay: animate a completed run's steps into the terminal,
  // timeline, and filmstrip with realistic timing so a read-only demo run still
  // *looks* live. No backend writes - purely client-side playback of seeded data.
  const startReplay = useCallback(
    async (allSteps: (TestStep | LiveStep)[], finalStatus: string, durationMs?: number) => {
      // Cancel any replay already running, then start a fresh token.
      replaySignalRef.current.cancelled = true;
      const signal = { cancelled: false };
      replaySignalRef.current = signal;

      setIsLive(true);
      setSteps([]);
      setTerminalLines([]);

      try {
        addTerminalLine('Connected to execution server', 'system');
        await sleep(400, signal);
        addTerminalLine('Launching browser...', 'running');
        await sleep(500, signal);

        for (const s of allSteps) {
          const stepNumber = s.step_number;
          const action = s.action;
          const selector = 'selector' in s ? s.selector : undefined;

          // Reveal the step as running…
          setSteps((prev) => [
            ...prev,
            { step_number: stepNumber, action, status: 'running', selector },
          ]);
          addTerminalLine(
            `Step ${stepNumber}: ${action}${selector ? ` → ${selector}` : ''}`,
            'running',
          );

          await sleep(replayDelay('duration_ms' in s ? s.duration_ms : undefined), signal);

          // …then settle it to its real recorded result (+ screenshot).
          setSteps((prev) => prev.map((p) => (p.step_number === stepNumber ? { ...p, ...s } : p)));
          const type =
            s.status === 'passed' ? 'success' : s.status === 'failed' ? 'error' : 'info';
          addTerminalLine(
            `Step ${stepNumber}: ${action} [${s.status}]${
              'duration_ms' in s && s.duration_ms ? ` (${s.duration_ms}ms)` : ''
            }`,
            type as TerminalLine['type'],
          );
          if ('screenshot_url' in s && s.screenshot_url) {
            addTerminalLine(`Screenshot captured for step ${stepNumber}`, 'info');
          }
        }

        await sleep(400, signal);
        if (finalStatus === 'passed') {
          addTerminalLine(
            `All steps passed ✓${durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : ''}`,
            'success',
          );
        } else if (finalStatus === 'failed') {
          addTerminalLine(
            `Test failed${durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : ''}`,
            'error',
          );
        } else {
          addTerminalLine(`Test ${finalStatus}`, 'info');
        }
      } catch {
        // Replay was cancelled (navigated away / restarted) - leave as-is.
      } finally {
        if (!signal.cancelled) setIsLive(false);
      }
    },
    [addTerminalLine],
  );

  // Fetch initial data
  const fetchRun = useCallback(async () => {
    try {
      const data = await apiClient.get<RunDetailResponse>(
        `/api/projects/${projectId}/test-runs/${runId}`,
      );
      setRun(data.test_run);
      setBugs(data.bugs);
      allStepsRef.current = data.steps;

      if (data.test_run.status === 'pending') {
        // Genuinely pending → real live execution over WebSocket.
        setSteps(data.steps);
        connectAndStartRun();
      } else if (data.steps.length > 0) {
        // Completed run with steps → scripted replay (read-only, looks live).
        setCanReplay(true);
        startReplay(data.steps, data.test_run.status, data.test_run.duration_ms ?? undefined);
      } else {
        // No steps recorded → nothing to animate.
        setSteps(data.steps);
      }
    } catch {
      router.push(`/dashboard/projects/${projectId}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, runId, router, startReplay]);

  const connectAndStartRun = async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const socket = socketIO(apiUrl, {
      auth: { token: session.access_token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsLive(true);
      addTerminalLine('Connected to execution server', 'system');
      socket.emit('test:join', { test_run_id: runId });
    });

    socket.on('test:status', (data: { message: string }) => {
      addTerminalLine(data.message, 'system');
    });

    socket.on('test:running', () => {
      setRun((prev) => (prev ? { ...prev, status: TestRunStatus.RUNNING } : prev));
      addTerminalLine('Launching browser...', 'running');
    });

    socket.on('test:step:start', (data: { step_number: number; action: string }) => {
      setSteps((prev) => {
        const exists = prev.find((s) => s.step_number === data.step_number);
        if (exists) return prev;
        return [...prev, { step_number: data.step_number, action: data.action, status: 'running' }];
      });
      addTerminalLine(`Step ${data.step_number}: ${data.action}`, 'running');
    });

    socket.on('test:step:complete', (data: LiveStep) => {
      setSteps((prev) =>
        prev.map((s) => (s.step_number === data.step_number ? { ...s, ...data } : s)),
      );
      const type =
        data.status === 'passed' ? 'success' : data.status === 'failed' ? 'error' : 'info';
      addTerminalLine(
        `Step ${data.step_number}: ${data.action} [${data.status}]${
          data.duration_ms ? ` (${data.duration_ms}ms)` : ''
        }`,
        type as TerminalLine['type'],
      );
    });

    socket.on('test:screenshot', (data: { step_number: number; screenshot_base64: string }) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.step_number === data.step_number
            ? { ...s, screenshot_base64: data.screenshot_base64 }
            : s,
        ),
      );
      addTerminalLine(`Screenshot captured for step ${data.step_number}`, 'info');
    });

    socket.on(
      'test:complete',
      (data: { status: string; duration_ms: number; error_message?: string }) => {
        setRun((prev) =>
          prev
            ? {
                ...prev,
                status: data.status as TestRunStatus,
                duration_ms: data.duration_ms,
                error_message: data.error_message ?? undefined,
              }
            : prev,
        );
        setIsLive(false);
        if (data.status === 'passed') {
          addTerminalLine(`All steps passed ✓ (${(data.duration_ms / 1000).toFixed(1)}s)`, 'success');
        } else {
          addTerminalLine(
            `Test ${data.status}${data.error_message ? `: ${data.error_message}` : ''} (${(data.duration_ms / 1000).toFixed(1)}s)`,
            'error',
          );
        }
        socket.disconnect();
      },
    );

    socket.on('test:bug_created', (data: { bug_id: string; bug_title: string }) => {
      setBugs((prev) => [
        ...prev,
        { id: data.bug_id, title: data.bug_title, severity: 'medium', status: 'open' },
      ]);
      addTerminalLine(`Bug created: ${data.bug_title}`, 'error');
    });

    socket.on('test:error', (data: { message: string }) => {
      setRun((prev) =>
        prev ? { ...prev, status: TestRunStatus.ERROR, error_message: data.message } : prev,
      );
      setIsLive(false);
      addTerminalLine(`Error: ${data.message}`, 'error');
      socket.disconnect();
    });

    socket.on('disconnect', (reason: string) => {
      // Intentional disconnects (run complete / unmount) are silent; transport
      // drops surface in the terminal so the user knows streaming paused.
      if (reason === 'transport close' || reason === 'transport error' || reason === 'ping timeout') {
        setIsLive(false);
        addTerminalLine('Connection lost - reconnecting...', 'error');
      }
    });

    socket.io.on('reconnect', () => {
      setIsLive(true);
      addTerminalLine('Reconnected to execution server', 'system');
      socket.emit('test:join', { test_run_id: runId });
    });

    socket.on('connect_error', (err: Error) => {
      addTerminalLine(`Connection failed: ${err.message}`, 'error');
    });
  };

  useEffect(() => {
    fetchRun();
    return () => {
      socketRef.current?.disconnect();
      // Stop any in-flight scripted replay so it doesn't update an unmounted tree.
      replaySignalRef.current.cancelled = true;
    };
  }, [fetchRun]);

  if (loading) {
    return <CenteredSpinner label="Loading run…" />;
  }

  if (!run) return null;

  const testTitle = run.test_cases?.title || 'Test Run';
  const hasCompletedSteps = steps.some((s) => s.status === 'passed' || s.status === 'failed');

  return (
    <div className="space-y-7">
      {/* ── Back nav + Header with actions ─────────────────────────────────── */}
      <div>
        <button
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to project
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{testTitle}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <StatusBadge status={run.status} />
              <span className="capitalize">
                {run.mode.replace('_', ' ')} · {run.browser || 'chromium'}
              </span>
              {run.duration_ms != null && (
                <span className="font-mono text-xs">
                  {run.duration_ms < 1000
                    ? `${run.duration_ms}ms`
                    : `${(run.duration_ms / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canReplay && (
              <Button
                variant="outline"
                onClick={() =>
                  startReplay(allStepsRef.current, run.status, run.duration_ms ?? undefined)
                }
                disabled={isLive}
                title={isLive ? 'Replay in progress' : 'Replay this run'}
                aria-label="Replay this test run"
              >
                <RotateCcw />
                {isLive ? 'Replaying…' : 'Replay'}
              </Button>
            )}

            <Button
              onClick={() =>
                downloadPlaywrightScript(steps, testTitle, run.projects?.base_url ?? undefined)
              }
              disabled={!hasCompletedSteps}
              title={hasCompletedSteps ? 'Download as Playwright TypeScript' : 'Run a test first'}
              aria-label="Export as Playwright TypeScript"
            >
              <Download />
              Export script
            </Button>
          </div>
        </div>

        {run.error_message && !isLive && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <span className="font-semibold">Error:</span> {run.error_message}
          </div>
        )}
      </div>

      {/* ── Two-Column Layout: Steps + Terminal ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,55%)_1fr]">
        {/* Left Column: Steps Timeline */}
        <div>
          <SectionLabel count={steps.length}>Steps</SectionLabel>

          {steps.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              {isLive ? 'Waiting for steps to execute…' : 'No steps recorded for this run.'}
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
                        <p className="text-sm font-medium capitalize text-foreground">{step.action}</p>
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
        </div>

        {/* Right Column: Live Terminal */}
        <div>
          <SectionLabel>Execution log</SectionLabel>
          <LiveTerminal lines={terminalLines} isLive={isLive} />
        </div>
      </div>

      {/* ── Screenshot Filmstrip ──────────────────────────────────────────── */}
      <div>
        <SectionLabel>Screenshots</SectionLabel>
        <ScreenshotFilmstrip steps={steps} onSelect={(src) => setSelectedScreenshot(src)} />
      </div>

      {/* ── Auto-Created Bugs ─────────────────────────────────────────────── */}
      {bugs.length > 0 && (
        <div>
          <SectionLabel count={bugs.length}>Bug reports</SectionLabel>
          <div className="space-y-2">
            {bugs.map((bug) => (
              <div
                key={bug.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Bug className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <p className="truncate text-sm font-medium">{bug.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SeverityBadge severity={bug.severity} />
                  <span className="rounded bg-muted px-2 py-0.5 text-[0.6875rem] font-medium capitalize text-muted-foreground">
                    {bug.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Screenshot Lightbox ───────────────────────────────────────────── */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 p-4 duration-200 animate-in fade-in"
          onClick={() => setSelectedScreenshot(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot preview"
        >
          <div className="relative mx-4 max-h-[90vh] max-w-4xl">
            <img
              src={selectedScreenshot}
              alt="Step screenshot"
              className="max-h-[90vh] w-auto rounded-lg border border-white/10 shadow-2xl"
            />
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
              aria-label="Close preview"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
