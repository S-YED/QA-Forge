'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Square, Play, RotateCcw, TriangleAlert, Globe, Crosshair } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { io as socketIO, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDemoMode, resolveDemoMode } from '@/lib/hooks/use-demo-mode';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { CenteredSpinner, Spinner } from '@/components/shared/spinner';

interface SessionAction {
  id: string;
  action_number: number;
  action_type: string;
  selector?: string;
  value?: string;
  url: string;
  timestamp_ms: number;
  metadata?: { screenshot?: string } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RecordedSession {
  id: string;
  name: string;
  description?: string;
  base_url: string;
  browser: string;
  status: 'recording' | 'completed' | 'error';
  duration_ms?: number;
  created_at: string;
}

interface RecordingPortalProps {
  projectId: string;
  sessionId: string;
}

const actionVariant = (type: string): BadgeProps['variant'] =>
  type === 'click' ? 'info' : type === 'type' ? 'success' : 'warning';

export function RecordingPortal({ projectId, sessionId }: RecordingPortalProps) {
  const router = useRouter();
  const [session, setSession] = useState<RecordedSession | null>(null);
  const [actions, setActions] = useState<SessionAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [liveMessage, setLiveMessage] = useState('Initializing stream connection…');
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const allActionsRef = useRef<SessionAction[]>([]);
  const playTokenRef = useRef(0);
  const startedRef = useRef(false);
  const isDemo = useDemoMode();
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [canReplay, setCanReplay] = useState(false);

  // Fetch initial session meta & past actions
  const fetchSessionData = useCallback(async () => {
    try {
      const data = await apiClient.get<{
        recorded_session: RecordedSession;
        actions: SessionAction[];
      }>(`/api/projects/${projectId}/recorded-sessions/${sessionId}`);

      setSession(data.recorded_session);
      setActions(data.actions ?? []);
      allActionsRef.current = data.actions ?? [];

      if (data.recorded_session.status === 'completed') {
        setIsLive(false);
        setLiveMessage('Session concluded');
      } else if (data.recorded_session.status === 'error') {
        setIsLive(false);
        setError('The browser session encountered an error and was terminated.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recording session details');
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  // Connect to socket server
  const connectSocket = useCallback(
    async (startBrowser: boolean) => {
      try {
        const supabase = createClient();
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();
        if (!authSession?.access_token) {
          setError('Authentication session expired');
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
        const socket = socketIO(apiUrl, {
          auth: { token: authSession.access_token },
          transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          setLiveMessage('Connected. Launching sandboxed browser…');
          socket.emit('recording:join', { session_id: sessionId });

          if (startBrowser) {
            socket.emit('recording:start', {
              session_id: sessionId,
              project_id: projectId,
              base_url: session?.base_url || '',
              browser: session?.browser || 'chromium',
            });
          }
        });

        socket.on('recording:started', () => {
          setIsLive(true);
          setLiveMessage('Live stream active');
        });

        socket.on('recording:frame', (data: { screenshot_base64: string }) => {
          setCurrentFrame(data.screenshot_base64);
          setIsLive(true);
          setLiveMessage('Live stream active');
        });

        socket.on('recording:action:captured', (data: { action: SessionAction }) => {
          setActions((prev) => {
            const exists = prev.find((a) => a.id === data.action.id);
            if (exists) return prev;
            return [...prev, data.action];
          });
        });

        socket.on('recording:completed', () => {
          setIsLive(false);
          setLiveMessage('Recording completed successfully');
          setSession((prev) => (prev ? { ...prev, status: 'completed' } : prev));
          socket.disconnect();
        });

        socket.on('recording:error', (data: { message: string }) => {
          setError(data.message);
          setIsLive(false);
          socket.disconnect();
        });

        socket.on('connect_error', () => {
          setLiveMessage('Retrying connection to backend service…');
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to configure stream pipeline');
      }
    },
    [projectId, sessionId, session],
  );

  // Replay a completed recording from its captured frames (demo / seeded data).
  const playback = useCallback(async () => {
    const token = ++playTokenRef.current;
    setError(null);
    setIsLive(true);
    setLiveMessage('Replaying recording…');
    await sleep(400);
    for (const a of allActionsRef.current) {
      if (playTokenRef.current !== token) return;
      setActiveActionId(a.id);
      if (a.metadata?.screenshot) setCurrentFrame(a.metadata.screenshot);
      await sleep(1600);
    }
    if (playTokenRef.current !== token) return;
    setActiveActionId(null);
    setIsLive(false);
    setLiveMessage('Recording complete');
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchSessionData();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [fetchSessionData]);

  // After the session loads: replay captured frames (demo / completed recordings
  // that carry frames) or connect to the live recording socket.
  useEffect(() => {
    if (!session || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const demo = await resolveDemoMode();
      const hasFrames = allActionsRef.current.some((a) => a.metadata?.screenshot);
      if (demo && hasFrames) {
        setCanReplay(true);
        playback();
        return;
      }
      const shouldStartBrowser =
        session.status === 'recording' && allActionsRef.current.length === 0;
      connectSocket(shouldStartBrowser);
    })();
  }, [session, connectSocket, playback]);

  // Scroll actions timeline to bottom
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [actions]);

  const handleStopRecording = async () => {
    if (!socketRef.current) return;
    socketRef.current.emit('recording:stop', { session_id: sessionId });
  };

  const handleCompileAndReplay = async () => {
    if (!session) return;
    setIsCompiling(true);

    // Demo is read-only: open the seeded run compiled from this recording.
    if (isDemo) {
      try {
        const data = await apiClient.get<{ test_runs: { id: string; mode: string }[] }>(
          `/api/projects/${projectId}/test-runs?page=1&per_page=50`,
        );
        const runs = data.test_runs ?? [];
        const rec = runs.find((r) => r.mode === 'manual_recording') ?? runs[0];
        if (rec) {
          router.push(`/dashboard/projects/${projectId}/runs/${rec.id}`);
          return;
        }
      } catch {
        /* fall through */
      }
      setIsCompiling(false);
      toast.info('Demo is read-only', {
        description: 'Sign up to compile recordings into runnable Playwright tests.',
      });
      return;
    }

    try {
      const data = await apiClient.post<{
        test_case: { id: string };
        test_run: { id: string };
      }>(`/api/projects/${projectId}/recorded-sessions/${sessionId}/replay`);

      router.push(`/dashboard/projects/${projectId}/runs/${data.test_run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compilation failed');
      setIsCompiling(false);
    }
  };

  if (loading) {
    return <CenteredSpinner label="Loading workbench…" />;
  }

  if (!session) return null;

  // Live socket frames arrive as base64; seeded/demo frames are asset URLs.
  const frameSrc = currentFrame
    ? currentFrame.startsWith('/') || currentFrame.startsWith('http')
      ? currentFrame
      : `data:image/png;base64,${currentFrame}`
    : null;

  return (
    <div className="space-y-6">
      {/* ── Workbench header ── */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <button
            onClick={() => router.push(`/dashboard/projects/${projectId}`)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to project
          </button>

          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            {session.name}
            {isLive && (
              <span className="relative flex size-2.5" aria-label="Recording" title="Recording">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
              </span>
            )}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {session.description ||
              'Interactive recording workbench. Navigate inside the viewport to capture automated test steps.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canReplay && (
            <Button variant="outline" onClick={playback} disabled={isLive}>
              <RotateCcw />
              {isLive ? 'Replaying…' : 'Replay'}
            </Button>
          )}
          {session.status === 'recording' && (
            <Button
              variant="outline"
              onClick={handleStopRecording}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Square className="fill-current" />
              Conclude session
            </Button>
          )}

          {session.status === 'completed' && (
            <Button
              onClick={handleCompileAndReplay}
              disabled={isCompiling || actions.length === 0}
            >
              {isCompiling ? (
                <>
                  <Spinner className="text-primary-foreground" />
                  Compiling script…
                </>
              ) : (
                <>
                  <Play />
                  Compile & replay
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">Session notice</p>
            <p className="text-destructive/90">{error}</p>
          </div>
        </div>
      )}

      {/* ── Viewport + timeline ── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {/* Live viewport */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Live viewport</h2>
            <Badge variant={isLive ? 'info' : 'secondary'}>{liveMessage}</Badge>
          </div>

          <div className="flex aspect-[16/10] flex-col overflow-hidden rounded-lg border border-console-border bg-console shadow-sm">
            {/* Browser chrome */}
            <div className="flex shrink-0 items-center gap-3 border-b border-console-border px-4 py-2.5">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-console-border bg-black/20 px-3 py-1">
                <Globe className="size-3 shrink-0 text-console-accent" />
                <span className="truncate font-mono text-xs text-console-muted">
                  {session.base_url}
                </span>
              </div>
            </div>

            {/* Screen */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
              {frameSrc ? (
                <img
                  src={frameSrc}
                  alt="Recorded browser viewport"
                  className="size-full object-contain"
                />
              ) : (
                <div className="scrollbar-console absolute inset-0 flex flex-col justify-between overflow-y-auto p-5 font-mono text-xs text-console-muted">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-console-accent">QA Forge session agent initialized</p>
                    <p>[{new Date().toLocaleTimeString()}] Spawning browser sandbox container…</p>
                    <p>[{new Date().toLocaleTimeString()}] Invoking Playwright runner (browser={session.browser})…</p>
                    <p>[{new Date().toLocaleTimeString()}] Setting up screen recording hooks…</p>
                    <p>[{new Date().toLocaleTimeString()}] Injecting event-capture scripts into the DOM…</p>
                    {isLive ? (
                      <p className="text-console-success">
                        [{new Date().toLocaleTimeString()}] Browser connected. Loading DOM…
                      </p>
                    ) : (
                      <p className="flex items-center gap-2 pt-1 text-console-info">
                        <Spinner className="text-console-info" />
                        {liveMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-between border-t border-console-border pt-2 text-[0.625rem] text-console-muted/70">
                    <span>target: {session.browser}</span>
                    <span>1280×720</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions timeline */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Recorded actions
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {actions.length}
            </span>
          </h2>

          <div className="flex h-[420px] flex-col rounded-lg border bg-card p-4">
            {actions.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Crosshair className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Waiting for actions</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Click links, fill fields, or navigate inside the viewport - captured steps appear
                    here in real time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="scrollbar-console flex-1 space-y-2.5 overflow-y-auto pr-1">
                {actions.map((act) => (
                  <div
                    key={act.id}
                    className={cn(
                      'rounded-lg border bg-secondary/40 p-3 transition-colors',
                      activeActionId === act.id && 'border-primary/50 bg-primary/[0.06]',
                    )}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary/12 font-mono text-[0.625rem] font-bold text-primary">
                          {act.action_number}
                        </span>
                        <Badge variant={actionVariant(act.action_type)} className="capitalize">
                          {act.action_type}
                        </Badge>
                      </div>
                      <span className="font-mono text-[0.625rem] text-muted-foreground">
                        +{(act.timestamp_ms / 1000).toFixed(1)}s
                      </span>
                    </div>

                    {act.selector && (
                      <p className="truncate rounded border bg-background px-1.5 py-1 font-mono text-[0.625rem] text-muted-foreground">
                        {act.selector}
                      </p>
                    )}

                    {act.value && (
                      <div className="mt-1 text-[0.6875rem] text-muted-foreground">
                        <span className="font-medium">Value:</span>{' '}
                        <span className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                          {act.value}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={timelineEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
