'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface RecordedSession {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  base_url: string;
  browser: string;
  status: 'recording' | 'completed' | 'error';
  duration_ms?: number;
  created_at: string;
}

interface TestRecordingsTabProps {
  projectId: string;
}

export function TestRecordingsTab({ projectId }: TestRecordingsTabProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<RecordedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [browserType, setBrowserType] = useState<'chromium' | 'firefox' | 'webkit'>('chromium');
  const [creating, setCreating] = useState(false);

  const fetchSessions = async () => {
    try {
      const data = await apiClient.get<{ recorded_sessions: RecordedSession[] }>(
        `/api/projects/${projectId}/recorded-sessions`
      );
      setSessions(data.recorded_sessions ?? []);
    } catch {
      // Handled by apiClient
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [projectId]);

  const handleStartRecording = async () => {
    if (!name.trim() || !baseUrl.trim()) return;
    setCreating(true);

    try {
      const response = await apiClient.post<{ recorded_session: RecordedSession }>(
        `/api/projects/${projectId}/recorded-sessions`,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          base_url: baseUrl.trim(),
          browser: browserType,
        }
      );

      const session = response.recorded_session;
      
      // Close modal and redirect to recording workbench
      setShowModal(false);
      setName('');
      setDescription('');
      setBaseUrl('');
      
      router.push(`/dashboard/projects/${projectId}/recordings/${session.id}`);
    } catch {
      // Handled by apiClient
    } finally {
      setCreating(false);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Recorded Sessions
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 transition-all duration-300 active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Record Session
        </button>
      </div>

      {/* Empty State */}
      {sessions.length === 0 && (
        <div className="relative rounded-2xl border border-white/[0.06] bg-[#0d0e15]/40 p-12 text-center overflow-hidden backdrop-blur-xl shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 to-transparent pointer-events-none" />
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><rect x="12" y="10" width="4" height="4" rx="1"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <h3 className="text-lg font-bold text-slate-100">No session recordings yet</h3>
          <p className="mx-auto text-sm text-slate-400 mt-2 mb-5 max-w-sm">
            Launch an interactive browser window to manually record clicks and interactions and convert them to test scripts.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:bg-violet-500 active:scale-95"
          >
            Start First Recording
          </button>
        </div>
      )}

      {/* Sessions Grid */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="relative rounded-2xl border border-white/[0.06] bg-[#0d0e15]/40 p-5 backdrop-blur-xl transition-all duration-300 hover:bg-slate-900/30 hover:border-white/[0.12] hover:shadow-lg flex flex-col justify-between"
            >
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
              
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-slate-200 truncate pr-2">{session.name}</h3>
                  <span className={cn(
                    "rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                    session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    session.status === 'recording' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20 animate-pulse' :
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  )}>
                    {session.status}
                  </span>
                </div>
                
                {session.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{session.description}</p>
                )}

                <div className="flex items-center gap-1.5 rounded-lg bg-slate-950/60 border border-white/[0.04] px-2.5 py-1 w-fit max-w-full">
                  <span className="text-[10px] text-slate-400 font-mono truncate">{session.base_url}</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.06] mt-4 pt-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {formatDuration(session.duration_ms)}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {new Date(session.created_at).toLocaleDateString()}
                  </span>
                </div>

                <button
                  onClick={() => router.push(`/dashboard/projects/${projectId}/recordings/${session.id}`)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-200 transition-all hover:bg-white/[0.08]"
                >
                  Open Workbench →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Start Recording Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d0e15]/95 p-6 backdrop-blur-xl shadow-2xl shadow-violet-500/5 mx-auto overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
            
            <h3 className="text-lg font-bold text-slate-100">Start Recording Session</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Enter target configurations to spin up a sandboxed live-streamed browser session.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Session Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Login Flow Recording"
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What flow is being captured in this session?"
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Target Base URL *</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="e.g. http://localhost:3000/login"
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Browser Type</label>
                <select
                  value={browserType}
                  onChange={(e) => setBrowserType(e.target.value as any)}
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100"
                >
                  <option value="chromium">Chromium (Chrome/Edge)</option>
                  <option value="firefox">Firefox</option>
                  <option value="webkit">WebKit (Safari)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.03] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartRecording}
                disabled={creating || !name.trim() || !baseUrl.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-xs font-bold text-white shadow-lg disabled:opacity-50 transition-all duration-300 active:scale-95"
              >
                {creating ? 'Launching...' : 'Launch Browser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
