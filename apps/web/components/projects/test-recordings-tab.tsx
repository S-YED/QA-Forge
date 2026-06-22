'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CircleDot, Clock, Calendar, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { EmptyState } from '@/components/shared/empty-state';
import { CenteredSpinner, Spinner } from '@/components/shared/spinner';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

const statusVariant: Record<RecordedSession['status'], BadgeProps['variant']> = {
  completed: 'success',
  recording: 'info',
  error: 'destructive',
};

export function TestRecordingsTab({ projectId }: TestRecordingsTabProps) {
  const router = useRouter();
  const isDemo = useDemoMode();
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
        `/api/projects/${projectId}/recorded-sessions`,
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

    // Demo is read-only: point at the seeded, playable recording instead.
    if (isDemo) {
      setShowModal(false);
      toast.info('Demo is read-only', {
        description: 'Open the sample “Homepage walkthrough” recording to watch playback.',
      });
      return;
    }

    setCreating(true);

    try {
      const response = await apiClient.post<{ recorded_session: RecordedSession }>(
        `/api/projects/${projectId}/recorded-sessions`,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          base_url: baseUrl.trim(),
          browser: browserType,
        },
      );

      const session = response.recorded_session;

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
    return `${minutes}m ${seconds % 60}s`;
  };

  if (loading) {
    return <CenteredSpinner label="Loading recordings…" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Recorded sessions</h3>
        <Button onClick={() => setShowModal(true)}>
          <CircleDot />
          Record session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={CircleDot}
          title="No recordings yet"
          description="Launch an interactive browser to capture clicks and interactions, then turn them into test scripts."
          action={
            <Button onClick={() => setShowModal(true)}>
              <CircleDot />
              Start first recording
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-col justify-between rounded-lg border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="truncate pr-2 font-semibold text-foreground">{session.name}</h4>
                  <Badge variant={statusVariant[session.status]} className="capitalize">
                    {session.status}
                  </Badge>
                </div>

                {session.description && (
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {session.description}
                  </p>
                )}

                <div className="inline-flex max-w-full items-center rounded-md border bg-secondary px-2 py-1">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {session.base_url}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatDuration(session.duration_ms)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="size-3" />
                    {new Date(session.created_at).toLocaleDateString()}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(`/dashboard/projects/${projectId}/recordings/${session.id}`)
                  }
                >
                  Open workbench
                  <ArrowRight />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Start Recording Modal ── */}
      <Dialog
        open={showModal}
        onOpenChange={(o) => {
          if (!o) setShowModal(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start recording session</DialogTitle>
            <DialogDescription>
              Spin up a sandboxed, live-streamed browser session against a target URL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rec-name">
                Session name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rec-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Login flow recording"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rec-description">Description</Label>
              <Textarea
                id="rec-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What flow is being captured?"
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rec-url">
                Target base URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rec-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://localhost:3000/login"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rec-browser">Browser</Label>
              <Select
                value={browserType}
                onValueChange={(v) => setBrowserType(v as 'chromium' | 'firefox' | 'webkit')}
              >
                <SelectTrigger id="rec-browser">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chromium">Chromium (Chrome / Edge)</SelectItem>
                  <SelectItem value="firefox">Firefox</SelectItem>
                  <SelectItem value="webkit">WebKit (Safari)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStartRecording}
              disabled={creating || !name.trim() || !baseUrl.trim()}
            >
              {creating && <Spinner className="text-primary-foreground" />}
              {creating ? 'Launching…' : 'Launch browser'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
