'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { TestRun, TestStep } from '@qaforge/shared-types';
import { TestRunStatus } from '@qaforge/shared-types';
import { io as socketIO, type Socket } from 'socket.io-client';

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

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-slate-500/10', text: 'text-slate-500', label: 'Pending' },
  running: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Running' },
  passed: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', label: 'Passed' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Failed' },
  error: { bg: 'bg-amber-500/10', text: 'text-amber-600', label: 'Error' },
  skipped: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'Skipped' },
};

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

function LiveTerminal({
  lines,
  isLive,
}: {
  lines: TerminalLine[];
  isLive: boolean;
}) {
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
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  const typeColors: Record<string, string> = {
    info: 'text-muted-foreground',
    success: 'text-emerald-500',
    error: 'text-red-500',
    running: 'text-blue-500',
    system: 'text-violet-400',
  };

  return (
    <div
      className="rounded-lg border bg-background/95 backdrop-blur-sm overflow-hidden flex flex-col"
      style={{ minHeight: '200px' }}
    >
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500/60" />
          <span className="h-3 w-3 rounded-full bg-amber-500/60" />
          <span className="h-3 w-3 rounded-full bg-emerald-500/60" />
        </div>
        <span className="text-xs text-muted-foreground font-mono ml-2">
          test-execution.log
        </span>
        {isLive && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-blue-500">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      {/* Terminal content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed scrollbar-custom"
        role="log"
        aria-live="polite"
        aria-label="Test execution log"
        style={{ maxHeight: '400px' }}
      >
        {lines.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="animate-pulse">▊</span>
            <span>Waiting for test...</span>
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground/50 select-none shrink-0">
                {line.timestamp}
              </span>
              <span className={typeColors[line.type] || 'text-foreground'}>
                {line.type === 'running' && '▶ '}
                {line.type === 'success' && '✓ '}
                {line.type === 'error' && '✗ '}
                {line.type === 'system' && '⚙ '}
                {line.message}
              </span>
            </div>
          ))
        )}
        {isLive && lines.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground mt-1">
            <span className="animate-pulse">▊</span>
          </div>
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
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Screenshots appear during test execution
      </div>
    );
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2 scrollbar-custom"
      style={{ scrollSnapType: 'x mandatory' }}
      role="list"
      aria-label="Test screenshots"
    >
      {screenshotSteps.map((step) => {
        const src =
          ('screenshot_base64' in step && step.screenshot_base64)
            ? `data:image/png;base64,${step.screenshot_base64}`
            : ('screenshot_url' in step ? step.screenshot_url : '') || '';

        return (
          <button
            key={step.step_number}
            onClick={() => onSelect(src)}
            className="shrink-0 rounded-lg border overflow-hidden hover:scale-105 hover:ring-2 hover:ring-violet-500/50 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ scrollSnapAlign: 'start', height: '120px' }}
            aria-label={`Screenshot from step ${step.step_number}`}
          >
            <img
              src={src}
              alt={`Step ${step.step_number}`}
              className="h-full w-auto object-cover"
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Main Run Detail Component ─────────────────────────────────────────────────

export function RunDetailClient({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
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
  // *looks* live. No backend writes — purely client-side playback of seeded data.
  const startReplay = useCallback(
    async (
      allSteps: (TestStep | LiveStep)[],
      finalStatus: string,
      durationMs?: number,
    ) => {
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
          setSteps((prev) =>
            prev.map((p) => (p.step_number === stepNumber ? { ...p, ...s } : p)),
          );
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
        // Replay was cancelled (navigated away / restarted) — leave as-is.
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
    const { data: { session } } = await supabase.auth.getSession();
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
      socket.emit('test:join', {
        test_run_id: runId,
      });
    });

    socket.on('test:status', (data: { message: string }) => {
      addTerminalLine(data.message, 'system');
    });

    socket.on('test:running', () => {
      setRun((prev) => prev ? { ...prev, status: TestRunStatus.RUNNING } : prev);
      addTerminalLine('Launching browser...', 'running');
    });

    socket.on('test:step:start', (data: { step_number: number; action: string }) => {
      setSteps((prev) => {
        const exists = prev.find((s) => s.step_number === data.step_number);
        if (exists) return prev;
        return [...prev, {
          step_number: data.step_number,
          action: data.action,
          status: 'running',
        }];
      });
      addTerminalLine(`Step ${data.step_number}: ${data.action}`, 'running');
    });

    socket.on('test:step:complete', (data: LiveStep) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.step_number === data.step_number ? { ...s, ...data } : s,
        ),
      );
      const type = data.status === 'passed' ? 'success' : data.status === 'failed' ? 'error' : 'info';
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

    socket.on('test:complete', (data: { status: string; duration_ms: number; error_message?: string }) => {
      setRun((prev) => prev ? {
        ...prev,
        status: data.status as TestRunStatus,
        duration_ms: data.duration_ms,
        error_message: data.error_message ?? undefined,
      } : prev);
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
    });

    socket.on('test:bug_created', (data: { bug_id: string; bug_title: string }) => {
      setBugs((prev) => [...prev, {
        id: data.bug_id,
        title: data.bug_title,
        severity: 'medium',
        status: 'open',
      }]);
      addTerminalLine(`Bug created: ${data.bug_title}`, 'error');
    });

    socket.on('test:error', (data: { message: string }) => {
      setRun((prev) => prev ? { ...prev, status: TestRunStatus.ERROR, error_message: data.message } : prev);
      setIsLive(false);
      addTerminalLine(`Error: ${data.message}`, 'error');
      socket.disconnect();
    });

    socket.on('disconnect', (reason: string) => {
      // Intentional disconnects (run complete / unmount) are silent; transport
      // drops surface in the terminal so the user knows streaming paused.
      if (reason === 'transport close' || reason === 'transport error' || reason === 'ping timeout') {
        setIsLive(false);
        addTerminalLine('Connection lost — reconnecting...', 'error');
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
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!run) return null;

  const runStatus = statusStyles[run.status] || statusStyles.pending;
  const testTitle = run.test_cases?.title || 'Test Run';
  const hasCompletedSteps = steps.some((s) => s.status === 'passed' || s.status === 'failed');

  return (
    <div className="space-y-6">
      {/* ── Back nav + Header with Export ──────────────────────────────────── */}
      <div>
        <button
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to Project
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {testTitle}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', runStatus.bg, runStatus.text)}>
                {isLive && run.status === 'running' && (
                  <span className="mr-1.5 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                )}
                {runStatus.label}
              </span>
              <span className="text-sm text-muted-foreground capitalize">
                {run.mode.replace('_', ' ')} • {run.browser || 'chromium'}
              </span>
              {run.duration_ms && (
                <span className="text-sm text-muted-foreground font-mono">
                  {run.duration_ms < 1000 ? `${run.duration_ms}ms` : `${(run.duration_ms / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Replay button — re-animate the recorded run */}
            {canReplay && (
              <button
                onClick={() =>
                  startReplay(
                    allStepsRef.current,
                    run.status,
                    run.duration_ms ?? undefined,
                  )
                }
                disabled={isLive}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
                  isLive
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'border bg-card hover:bg-muted/60 hover:scale-[1.02]',
                )}
                title={isLive ? 'Replay in progress' : 'Replay this run'}
                aria-label="Replay this test run"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                {isLive ? 'Replaying…' : 'Replay'}
              </button>
            )}

            {/* Export Script button (T4) */}
            <button
              onClick={() =>
                downloadPlaywrightScript(steps, testTitle, run.projects?.base_url ?? undefined)
              }
              disabled={!hasCompletedSteps}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
                hasCompletedSteps
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20 hover:bg-violet-500 hover:scale-[1.02]'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
              title={hasCompletedSteps ? 'Download as Playwright TypeScript' : 'Run a test first'}
              aria-label="Export as Playwright TypeScript"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              Export Script
            </button>
          </div>
        </div>

        {/* Error message */}
        {run.error_message && !isLive && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600">
            <strong>Error:</strong> {run.error_message}
          </div>
        )}
      </div>

      {/* ── Two-Column Layout: Steps + Terminal ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[55%_1fr] gap-4">
        {/* Left Column: Steps Timeline */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Steps ({steps.length})
          </h2>

          {steps.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {isLive ? 'Waiting for steps to execute...' : 'No steps recorded for this run.'}
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step) => {
                const stepStatus = statusStyles[step.status] || statusStyles.pending;

                return (
                  <div
                    key={step.step_number}
                    className={cn(
                      'rounded-lg border bg-card p-3 transition-all',
                      step.status === 'running' && 'border-blue-500/40 shadow-sm shadow-blue-500/10',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Step number circle */}
                        <div className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          step.status === 'passed' ? 'bg-emerald-500 text-white' :
                          step.status === 'failed' ? 'bg-red-500 text-white' :
                          step.status === 'running' ? 'bg-blue-500 text-white animate-pulse' :
                          step.status === 'skipped' ? 'bg-gray-300 text-gray-600' :
                          'bg-muted text-muted-foreground',
                        )}>
                          {step.status === 'passed' ? '✓' :
                           step.status === 'failed' ? '✗' :
                           step.step_number}
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm font-medium">{step.action}</p>
                          {'selector' in step && step.selector && (
                            <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
                              {step.selector}
                            </p>
                          )}
                          {'error_message' in step && step.error_message && (
                            <p className="text-xs text-red-500 mt-1">{step.error_message}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {'duration_ms' in step && step.duration_ms !== undefined && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {step.duration_ms}ms
                          </span>
                        )}
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', stepStatus.bg, stepStatus.text)}>
                          {stepStatus.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Live Terminal (T5) */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Execution Log
          </h2>
          <LiveTerminal lines={terminalLines} isLive={isLive} />
        </div>
      </div>

      {/* ── Screenshot Filmstrip (T6) ─────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Screenshots
        </h2>
        <ScreenshotFilmstrip
          steps={steps}
          onSelect={(src) => setSelectedScreenshot(src)}
        />
      </div>

      {/* ── Auto-Created Bugs ─────────────────────────────────────────────── */}
      {bugs.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Bug Reports ({bugs.length})
          </h2>
          <div className="space-y-2">
            {bugs.map((bug) => (
              <div
                key={bug.id}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-400"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  <p className="text-sm font-medium truncate">{bug.title}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                    bug.severity === 'critical' ? 'bg-red-500/10 text-red-600' :
                    bug.severity === 'high' ? 'bg-orange-500/10 text-orange-600' :
                    bug.severity === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                    'bg-slate-500/10 text-slate-600'
                  )}>
                    {bug.severity}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] mx-4">
            <img
              src={selectedScreenshot}
              alt="Step screenshot"
              className="rounded-lg shadow-2xl max-h-[90vh] w-auto"
            />
            <button
              onClick={() => setSelectedScreenshot(null)}
              className="absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
