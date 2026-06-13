'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { io as socketIO, type Socket } from 'socket.io-client';

interface SessionAction {
  id: string;
  action_number: number;
  action_type: string;
  selector?: string;
  value?: string;
  url: string;
  timestamp_ms: number;
}

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

export function RecordingPortal({ projectId, sessionId }: RecordingPortalProps) {
  const router = useRouter();
  const [session, setSession] = useState<RecordedSession | null>(null);
  const [actions, setActions] = useState<SessionAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [liveMessage, setLiveMessage] = useState('Initializing stream connection...');
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial session meta & past actions
  const fetchSessionData = useCallback(async () => {
    try {
      const data = await apiClient.get<{
        recorded_session: RecordedSession;
        actions: SessionAction[];
      }>(`/api/projects/${projectId}/recorded-sessions/${sessionId}`);
      
      setSession(data.recorded_session);
      setActions(data.actions ?? []);
      
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
  const connectSocket = useCallback(async (startBrowser: boolean) => {
    try {
      const supabase = createClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
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
        setLiveMessage('Connected to server. Launching sandboxed browser...');
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
        setLiveMessage('Live Stream Active');
      });

      socket.on('recording:frame', (data: { screenshot_base64: string }) => {
        setCurrentFrame(data.screenshot_base64);
        setIsLive(true);
        setLiveMessage('Live Stream Active');
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
        setSession((prev) => prev ? { ...prev, status: 'completed' } : prev);
        socket.disconnect();
      });

      socket.on('recording:error', (data: { message: string }) => {
        setError(data.message);
        setIsLive(false);
        socket.disconnect();
      });

      socket.on('connect_error', () => {
        setLiveMessage('Retrying connection to backend service...');
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure stream pipeline');
    }
  }, [projectId, sessionId, session]);

  // Initial fetch
  useEffect(() => {
    fetchSessionData();
    return () => {
      socketRef.current?.disconnect();
    };
  }, [fetchSessionData]);

  // Start socket after session is loaded
  useEffect(() => {
    if (!session || socketRef.current) return;
    
    // Automatically trigger start if session is newly created ('recording' and has no actions yet)
    const shouldStartBrowser = session.status === 'recording' && actions.length === 0;
    connectSocket(shouldStartBrowser);
  }, [session, connectSocket, actions.length]);

  // Scroll actions timeline to bottom
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [actions]);

  // Stop recording manually
  const handleStopRecording = async () => {
    if (!socketRef.current) return;
    socketRef.current.emit('recording:stop', { session_id: sessionId });
  };

  // Compile session actions into test case and run
  const handleCompileAndReplay = async () => {
    if (!session) return;
    setIsCompiling(true);
    
    try {
      // Replay triggers completing the session AND compiling test steps in one go!
      const data = await apiClient.post<{
        test_case: { id: string };
        test_run: { id: string };
      }>(`/api/projects/${projectId}/recorded-sessions/${sessionId}/replay`);
      
      // Redirect to the newly triggered replaying test run!
      router.push(`/dashboard/projects/${projectId}/runs/${data.test_run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compilation failed');
      setIsCompiling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-violet-500 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-400">Loading workbench details...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="space-y-6">
      {/* ── Workbench Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div className="space-y-1">
          <button
            onClick={() => router.push(`/dashboard/projects/${projectId}`)}
            className="group mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all duration-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
            Back to Project
          </button>
          
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-100 flex items-center gap-2.5">
            {session.name}
            {isLive && (
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-400 max-w-xl font-medium leading-relaxed">
            {session.description || 'Interactive web recording workbench. Navigate inside the viewport to record automated tests.'}
          </p>
        </div>

        {/* Action Panel Controls */}
        <div className="flex items-center gap-3">
          {session.status === 'recording' && (
            <button
              onClick={handleStopRecording}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-500/20 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
              Conclude Session
            </button>
          )}

          {session.status === 'completed' && (
            <button
              onClick={handleCompileAndReplay}
              disabled={isCompiling || actions.length === 0}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg disabled:opacity-50 transition-all duration-300 active:scale-95"
            >
              {isCompiling ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                  Compiling Playwright Script...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  Compile & Replay Test Run
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3.5 text-sm text-red-400 flex items-start gap-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          <div className="space-y-1">
            <h5 className="font-bold">Session Notice</h5>
            <p className="text-xs text-red-300/90">{error}</p>
          </div>
        </div>
      )}

      {/* ── Main Viewport and Timeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Section: Live Viewport stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              Interactive Remote Viewport
              <span className={cn(
                "rounded-md px-1.5 py-0.5 text-[9px] font-bold border",
                isLive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"
              )}>
                {liveMessage}
              </span>
            </h2>
          </div>

          <div className="relative rounded-2xl border border-white/[0.08] bg-[#090a0f]/80 overflow-hidden shadow-2xl backdrop-blur-2xl aspect-[16/10] flex flex-col">
            {/* Real browser frame mock */}
            <div className="bg-[#12131e] border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-3 shrink-0">
              {/* Traffic lights */}
              <div className="flex gap-1.5 shrink-0">
                <span className="h-3 w-3 rounded-full bg-red-500/40" />
                <span className="h-3 w-3 rounded-full bg-amber-500/40" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/40" />
              </div>
              
              {/* Navigation buttons */}
              <div className="flex gap-2 text-slate-500 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
              </div>

              {/* URL address bar */}
              <div className="flex-1 bg-slate-950/60 rounded-lg border border-white/[0.04] px-3 py-1 flex items-center gap-2 max-w-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-violet-400 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span className="text-[10px] text-slate-300 font-mono truncate">{session.base_url}</span>
              </div>
            </div>

            {/* Display screen body */}
            <div className="flex-1 bg-[#020205] relative overflow-hidden flex items-center justify-center">
              {currentFrame ? (
                <img
                  src={`data:image/png;base64,${currentFrame}`}
                  alt="Remote sandboxed browser viewport"
                  className="w-full h-full object-contain"
                />
              ) : (
                /* Bootstrapping Console Logs Terminal */
                <div className="absolute inset-0 p-6 font-mono text-xs text-slate-400 bg-slate-950/95 flex flex-col justify-between overflow-y-auto">
                  <div className="space-y-2">
                    <p className="text-violet-400 font-bold">--- QA FORGE SESSION AGENT INITIALIZED ---</p>
                    <p className="text-slate-500">[{new Date().toLocaleTimeString()}] Spawning Docker browser sandbox container...</p>
                    <p className="text-slate-500">[{new Date().toLocaleTimeString()}] Invoking Playwright browser runner (browser={session.browser})...</p>
                    <p className="text-slate-500">[{new Date().toLocaleTimeString()}] Setting up screen recording canvas hooks...</p>
                    <p className="text-slate-500">[{new Date().toLocaleTimeString()}] Injecting event capture scripts into target DOM tree...</p>
                    {isLive ? (
                      <p className="text-emerald-400 animate-pulse">[{new Date().toLocaleTimeString()}] Browser successfully connected. Loading DOM tree...</p>
                    ) : (
                      <div className="flex items-center gap-2 pt-2 text-violet-400 font-semibold">
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-violet-500 border-t-transparent" />
                        {liveMessage}
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t border-white/[0.04] pt-2 text-[10px] text-slate-650 flex justify-between">
                    <span>Target: {session.browser} // headless=true</span>
                    <span>1280x720 VncFrameBuffer</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Actions Timeline */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            Recorded Action Steps
            <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold border border-white/[0.06] text-slate-400">
              {actions.length}
            </span>
          </h2>

          <div className="relative rounded-2xl border border-white/[0.08] bg-[#090a0f]/80 p-5 shadow-2xl backdrop-blur-2xl h-[420px] flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-violet-500/20 to-transparent pointer-events-none" />
            
            {actions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
                <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400">Waiting for actions...</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Click links, fill text boxes, or navigate. Recorded actions will appear here in real-time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
                {actions.map((act) => (
                  <div
                    key={act.id}
                    className="relative rounded-xl border border-white/[0.04] bg-slate-950/40 p-3 hover:border-white/[0.08] transition-colors"
                  >
                    {/* Badge header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600/20 border border-violet-500/20 text-[10px] font-extrabold text-violet-400">
                          {act.action_number}
                        </span>
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider",
                          act.action_type === 'click' ? 'bg-blue-500/10 text-blue-400' :
                          act.action_type === 'type' ? 'bg-emerald-500/10 text-emerald-400' :
                          'bg-amber-500/10 text-amber-400'
                        )}>
                          {act.action_type}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">
                        +{((act.timestamp_ms) / 1000).toFixed(1)}s
                      </span>
                    </div>

                    {/* Selector */}
                    {act.selector && (
                      <p className="text-[10px] font-mono text-slate-350 bg-slate-950/90 border border-white/[0.04] p-1.5 rounded truncate">
                        {act.selector}
                      </p>
                    )}

                    {/* Value */}
                    {act.value && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        <span className="text-slate-500 font-semibold">Value:</span>{' '}
                        <span className="text-slate-300 font-mono bg-slate-900 px-1 py-0.5 rounded">{act.value}</span>
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
