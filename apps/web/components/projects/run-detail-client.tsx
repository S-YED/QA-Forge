'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, RotateCcw, Bug, X } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { createClient } from '@/lib/supabase/client';
import { isRunActive, mergeSavedSteps, upsertStep } from '@/lib/run-steps';
import type { TestRun, TestStep } from '@qaforge/shared-types';
import { TestRunStatus } from '@qaforge/shared-types';
import { io as socketIO, type Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { StatusBadge, SeverityBadge } from '@/components/shared/status-badge';
import { Spinner } from '@/components/shared/spinner';
import { RunDetailSkeleton } from '@/components/shared/page-skeletons';
import {
  LiveTerminal,
  ScreenshotFilmstrip,
  SectionLabel,
  StepsTimeline,
  downloadPlaywrightScript,
  type LiveStep,
  type TerminalLine,
  type ViewMode,
} from '@/components/projects/run-panels';

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

// ── Main Run Detail Component ─────────────────────────────────────────────────

export function RunDetailClient({ projectId, runId }: { projectId: string; runId: string }) {
  const router = useRouter();
  const [run, setRun] = useState<RunDetailResponse['test_run'] | null>(null);
  const [exporting, setExporting] = useState(false);

  // Export from the saved run, not the on-screen list: live events carry no element or value, and a replay
  // animation shows only part of the steps.
  const exportScript = async () => {
    setExporting(true);
    try {
      const data = await apiClient.get<RunDetailResponse>(`/api/projects/${projectId}/test-runs/${runId}`);
      downloadPlaywrightScript(data.steps, testTitle, data.test_run.projects?.base_url ?? undefined);
    } catch (err) {
      toastError('Could not export the script', err);
    } finally {
      setExporting(false);
    }
  };
  const [steps, setSteps] = useState<(TestStep | LiveStep)[]>([]);
  const [bugs, setBugs] = useState<RunDetailResponse['bugs']>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [canReplay, setCanReplay] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  // Incremented per mount and on cleanup, so only the current mount's connectLive opens a socket.
  const effectGen = useRef(0);
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

  // Replay: re-animate a finished run's recorded steps into the terminal, timeline and
  // filmstrip. Purely client-side and labelled "Replay"; it never claims to be live.
  const startReplay = useCallback(
    async (allSteps: (TestStep | LiveStep)[], finalStatus: string, durationMs?: number) => {
      // Cancel any replay already running, then start a fresh token.
      replaySignalRef.current.cancelled = true;
      const signal = { cancelled: false };
      replaySignalRef.current = signal;

      setMode('replay');
      setSteps([]);
      setTerminalLines([]);

      try {
        addTerminalLine('Replaying a finished run from its recorded results (not live)', 'system');
        await sleep(400, signal);

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
        if (!signal.cancelled) setMode(null);
      }
    },
    [addTerminalLine],
  );

  // The API (database) is the source of truth: loaded on open, after every (re)join and on completion.
  const loadRun = useCallback(async () => {
    const data = await apiClient.get<RunDetailResponse>(
      `/api/projects/${projectId}/test-runs/${runId}`,
    );
    setRun(data.test_run);
    setBugs(data.bugs);
    allStepsRef.current = data.steps;
    return data;
  }, [projectId, runId]);

  const fetchRun = useCallback(async (gen: number) => {
    try {
      const data = await loadRun();
      if (isRunActive(data.test_run.status)) {
        // Pending or running (e.g. the page was refreshed mid-run) → watch it live.
        setSteps(data.steps);
        connectLive(gen);
      } else if (data.steps.length > 0) {
        // Finished run → play back its recorded steps, labelled as a replay.
        setCanReplay(true);
        startReplay(data.steps, data.test_run.status, data.test_run.duration_ms ?? undefined);
      } else {
        // No steps recorded → nothing to animate.
        setSteps(data.steps);
      }
    } catch (err) {
      toastError('Could not open this run', err);
      router.push(`/dashboard/projects/${projectId}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, router, startReplay, loadRun]);

  const connectLive = async (gen: number) => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    // The mount that asked for this socket may be gone by now (navigated away, or React's dev
    // double-mount); without this check its late socket would stream every event a second time.
    if (!session?.access_token || gen !== effectGen.current) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const socket = socketIO(apiUrl, {
      auth: { token: session.access_token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;
    let connectedBefore = false;

    // Stop watching and take the final state from the database, not from the last event.
    const settle = async () => {
      socket.disconnect();
      setMode(null);
      const data = await loadRun().catch(() => null);
      if (data) setSteps((prev) => mergeSavedSteps(prev, data.steps));
    };

    // Fires on the first connection and on every reconnection.
    socket.on('connect', async () => {
      setMode('live');
      addTerminalLine(connectedBefore ? 'Reconnected, catching up' : 'Connected to execution server', 'system');
      connectedBefore = true;
      // Join first, then reload: whatever was emitted before the join (or while
      // disconnected) is in the reload, and everything after it arrives as events.
      const joined = await socket
        .timeout(10_000)
        .emitWithAck('test:join', { test_run_id: runId })
        .catch(() => null);
      if (!joined?.ok) {
        setMode(null);
        addTerminalLine('Could not subscribe to this run. Refresh the page to try again.', 'error');
        return;
      }
      const data = await loadRun().catch(() => null);
      if (!data) return;
      setSteps((prev) => mergeSavedSteps(prev, data.steps));
      if (!isRunActive(data.test_run.status)) {
        addTerminalLine(`Run already finished: ${data.test_run.status}`, 'system');
        socket.disconnect();
        setMode(null);
      }
    });

    socket.on('test:status', (data: { message: string }) => {
      addTerminalLine(data.message, 'system');
    });

    socket.on('test:running', () => {
      setRun((prev) => (prev ? { ...prev, status: TestRunStatus.RUNNING } : prev));
      addTerminalLine('Launching browser...', 'running');
    });

    socket.on('test:step:start', (data: { step_number: number; action: string }) => {
      // A start never downgrades a step the client already has (e.g. from a reload).
      setSteps((prev) =>
        prev.some((s) => s.step_number === data.step_number)
          ? prev
          : upsertStep(prev, { step_number: data.step_number, action: data.action, status: 'running' }),
      );
      addTerminalLine(`Step ${data.step_number}: ${data.action}`, 'running');
    });

    socket.on('test:step:complete', (data: LiveStep) => {
      setSteps((prev) => upsertStep(prev, data));
      const type =
        data.status === 'passed' ? 'success' : data.status === 'failed' ? 'error' : 'info';
      addTerminalLine(
        `Step ${data.step_number}: ${data.instruction ?? data.action} [${data.status}]${
          data.duration_ms ? ` (${data.duration_ms}ms)` : ''
        }`,
        type as TerminalLine['type'],
      );
    });

    socket.on('test:screenshot', (data: { step_number: number; screenshot_base64: string }) => {
      setSteps((prev) =>
        upsertStep(prev, { step_number: data.step_number, screenshot_base64: data.screenshot_base64 }),
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
        if (data.status === 'passed') {
          addTerminalLine(`All steps passed ✓ (${(data.duration_ms / 1000).toFixed(1)}s)`, 'success');
        } else {
          addTerminalLine(
            `Test ${data.status}${data.error_message ? `: ${data.error_message}` : ''} (${(data.duration_ms / 1000).toFixed(1)}s)`,
            'error',
          );
        }
        void settle();
      },
    );

    socket.on('test:bug_created', (data: { bug_id: string; bug_title: string }) => {
      setBugs((prev) => [
        ...prev,
        { id: data.bug_id, title: data.bug_title, severity: 'medium', status: 'open' },
      ]);
      addTerminalLine(`Bug created: ${data.bug_title}`, 'error');
    });

    // The executor always follows test:error with test:complete, which settles the run.
    socket.on('test:error', (data: { message: string }) => {
      setRun((prev) =>
        prev ? { ...prev, status: TestRunStatus.ERROR, error_message: data.message } : prev,
      );
      addTerminalLine(`Error: ${data.message}`, 'error');
    });

    socket.on('disconnect', (reason: string) => {
      // Intentional disconnects (run complete / unmount) are silent; transport
      // drops surface in the terminal so the user knows streaming paused. The
      // 'connect' handler rejoins and reloads when the connection comes back.
      if (reason === 'transport close' || reason === 'transport error' || reason === 'ping timeout') {
        setMode(null);
        addTerminalLine('Connection lost - reconnecting...', 'error');
      }
    });

    socket.on('connect_error', (err: Error) => {
      addTerminalLine(`Connection failed: ${err.message}`, 'error');
    });
  };

  useEffect(() => {
    const gen = ++effectGen.current;
    fetchRun(gen);
    return () => {
      effectGen.current++; // a connectLive still awaiting its session must not open a socket
      socketRef.current?.disconnect();
      // Stop any in-flight scripted replay so it doesn't update an unmounted tree.
      replaySignalRef.current.cancelled = true;
    };
  }, [fetchRun]);

  if (loading) {
    return <RunDetailSkeleton />;
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
                {/* every run executes saved steps; "ai_driven" is a legacy mode value, not AI at run time */}
                {run.mode === 'replay' ? 'Replay of recording' : 'Run'} · {run.browser || 'chromium'}
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
                disabled={mode !== null}
                title={mode === 'replay' ? 'Replay in progress' : 'Replay this run'}
                aria-label="Replay this test run"
              >
                <RotateCcw />
                {mode === 'replay' ? 'Replaying…' : 'Replay'}
              </Button>
            )}

            <Button
              onClick={exportScript}
              disabled={!hasCompletedSteps || exporting}
              title={hasCompletedSteps ? 'Download as Playwright TypeScript' : 'Run a test first'}
              aria-label="Export as Playwright TypeScript"
            >
              {exporting ? <Spinner className="text-primary-foreground" /> : <Download />}
              {exporting ? 'Exporting…' : 'Export script'}
            </Button>
          </div>
        </div>

        {run.error_message && mode === null && (
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

          <StepsTimeline steps={steps} mode={mode} />
        </div>

        {/* Right Column: Live Terminal */}
        <div>
          <SectionLabel>Execution log</SectionLabel>
          <LiveTerminal lines={terminalLines} mode={mode} />
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
