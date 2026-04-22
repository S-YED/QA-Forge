'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { TestRun, TestStep } from '@qaforge/shared-types';
import { io as socketIO, type Socket } from 'socket.io-client';

interface RunDetailResponse {
  test_run: TestRun & { test_cases?: { title: string; steps: unknown[] } | null };
  steps: TestStep[];
  bugs: { id: string; title: string; severity: string; status: string }[];
}

interface LiveStep {
  step_number: number;
  action: string;
  status: string;
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
  const [liveMessage, setLiveMessage] = useState('');
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Fetch initial data
  const fetchRun = useCallback(async () => {
    try {
      const data = await apiClient.get<RunDetailResponse>(
        `/api/projects/${projectId}/test-runs/${runId}`,
      );
      setRun(data.test_run);
      setSteps(data.steps);
      setBugs(data.bugs);

      // If the run is pending, start execution via WebSocket
      if (data.test_run.status === 'pending') {
        connectAndStartRun(data.test_run);
      }
    } catch {
      router.push(`/dashboard/projects/${projectId}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, runId, router]);

  const connectAndStartRun = async (testRun: RunDetailResponse['test_run']) => {
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
      socket.emit('test:join', {
        test_run_id: runId,
      });
    });

    socket.on('test:status', (data: { message: string }) => {
      setLiveMessage(data.message);
    });

    socket.on('test:running', () => {
      setRun((prev) => prev ? { ...prev, status: 'running' as const } : prev);
      setLiveMessage('Running test...');
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
      setLiveMessage(`Step ${data.step_number}: ${data.action}`);
    });

    socket.on('test:step:complete', (data: LiveStep) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.step_number === data.step_number ? { ...s, ...data } : s,
        ),
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
    });

    socket.on('test:complete', (data: { status: string; duration_ms: number; error_message?: string }) => {
      setRun((prev) => prev ? {
        ...prev,
        status: data.status as TestRun['status'],
        duration_ms: data.duration_ms,
        error_message: data.error_message ?? undefined,
      } : prev);
      setIsLive(false);
      setLiveMessage('');
      socket.disconnect();
    });

    socket.on('test:bug_created', (data: { bug_id: string; bug_title: string }) => {
      setBugs((prev) => [...prev, {
        id: data.bug_id,
        title: data.bug_title,
        severity: 'medium',
        status: 'open',
      }]);
    });

    socket.on('test:error', (data: { message: string }) => {
      setRun((prev) => prev ? { ...prev, status: 'error' as const, error_message: data.message } : prev);
      setIsLive(false);
      setLiveMessage('');
      socket.disconnect();
    });
  };

  useEffect(() => {
    fetchRun();
    return () => {
      socketRef.current?.disconnect();
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

  return (
    <div className="space-y-6">
      {/* ── Back nav + Header ─────────────────────────────────────────────── */}
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
              {run.test_cases?.title || `Test Run`}
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
        </div>

        {/* Live message */}
        {liveMessage && (
          <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-2 text-sm text-blue-600 flex items-center gap-2">
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent" />
            {liveMessage}
          </div>
        )}

        {/* Error message */}
        {run.error_message && !isLive && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600">
            <strong>Error:</strong> {run.error_message}
          </div>
        )}
      </div>

      {/* ── Steps Timeline ────────────────────────────────────────────────── */}
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
              const hasScreenshot = ('screenshot_base64' in step && step.screenshot_base64) || ('screenshot_url' in step && step.screenshot_url);

              return (
                <div
                  key={step.step_number}
                  className={cn(
                    'rounded-lg border bg-card p-4 transition-all',
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

                  {/* Screenshot thumbnail */}
                  {hasScreenshot && (
                    <div className="mt-3">
                      <button
                        onClick={() => {
                          const src = ('screenshot_base64' in step && step.screenshot_base64)
                            ? `data:image/png;base64,${step.screenshot_base64}`
                            : ('screenshot_url' in step ? step.screenshot_url : '') || '';
                          setSelectedScreenshot(src);
                        }}
                        className="block rounded-md border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
                      >
                        <img
                          src={
                            ('screenshot_base64' in step && step.screenshot_base64)
                              ? `data:image/png;base64,${step.screenshot_base64}`
                              : ('screenshot_url' in step ? step.screenshot_url : '') || ''
                          }
                          alt={`Step ${step.step_number} screenshot`}
                          className="h-32 w-auto object-cover"
                        />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
