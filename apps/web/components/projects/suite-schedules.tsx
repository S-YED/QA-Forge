'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toastError } from '@/lib/toast-error';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/shared/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Schedule {
  suite_id: string;
  frequency: 'daily' | 'weekly';
  hour: number;
  weekday: number | null;
  timezone: string;
  enabled: boolean;
  next_run_at: string;
  last_batch_id: string | null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const describe = (s: Schedule) =>
  `${s.frequency === 'daily' ? 'Every day' : `Every ${DAYS[s.weekday ?? 1]}`} at ${clock(s.hour)} (${s.timezone.replace(/_/g, ' ')})`;

/** F9: one schedule per suite, daily or weekly at an hour in the viewer's timezone. */
export function SuiteSchedules({ projectId, suites }: { projectId: string; suites: { id: string; name: string }[] }) {
  const isDemo = useDemoMode();
  const path = `/api/projects/${projectId}/schedules`;
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [weekday, setWeekday] = useState(1);
  const [hour, setHour] = useState(9);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<{ schedules: Schedule[]; available: boolean }>(path);
      setSchedules(data.schedules ?? []);
      setAvailable(data.available !== false);
    } catch (err) {
      setSchedules([]);
      toastError('Could not load the schedules', err);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const bySuite = new Map((schedules ?? []).map((s) => [s.suite_id, s]));
  const current = editing ? bySuite.get(editing.id) : undefined;
  // New schedules use the viewer's own timezone; an existing one keeps the timezone it was saved with.
  const timezone = current?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

  const openDialog = (suite: { id: string; name: string }) => {
    if (isDemo) {
      toast.info('Demo is read-only', { description: 'Sign up to schedule suite runs for your own projects.' });
      return;
    }
    const s = bySuite.get(suite.id);
    setEditing(suite);
    setFrequency(s?.frequency ?? 'daily');
    setWeekday(s?.weekday ?? 1);
    setHour(s?.hour ?? 9);
    setEnabled(s?.enabled ?? true);
    setOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    setBusy('save');
    try {
      await apiClient.put(`${path}/${editing.id}`, { frequency, hour, weekday: frequency === 'weekly' ? weekday : null, timezone, enabled });
      toast.success('Schedule saved');
      setOpen(false);
      void load();
    } catch (err) {
      toastError('Could not save the schedule', err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy('remove');
    try {
      await apiClient.del(`${path}/${editing.id}`);
      toast.success('Schedule removed');
      setOpen(false);
      void load();
    } catch (err) {
      toastError('Could not remove the schedule', err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Scheduled runs</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Run a suite on its own every day or every week. Each run appears under Runs like one you started yourself.
        </p>
      </div>

      {schedules === null ? (
        <div className="flex justify-center py-8">
          <Spinner className="text-primary" />
        </div>
      ) : !available ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Schedules are not available yet. The database needs an update first.
        </p>
      ) : suites.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Create a suite first, then schedule it here.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
          {suites.map((suite) => {
            const s = bySuite.get(suite.id);
            return (
              <li key={suite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{suite.name}</span>
                    {s && !s.enabled && <Badge variant="secondary">Paused</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s ? (
                      <>
                        {describe(s)}
                        {s.enabled && <> · next run {when(s.next_run_at)}</>}
                        {s.last_batch_id && (
                          <>
                            {' · '}
                            <Link
                              href={`/dashboard/projects/${projectId}/batches/${s.last_batch_id}`}
                              className="font-medium text-primary underline-offset-2 hover:underline"
                            >
                              last run
                            </Link>
                          </>
                        )}
                      </>
                    ) : (
                      'Not scheduled'
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start sm:self-auto"
                  onClick={() => openDialog(suite)}
                  aria-label={`${s ? 'Change the schedule of' : 'Schedule'} ${suite.name}`}
                >
                  <CalendarClock />
                  {s ? 'Change' : 'Schedule'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule {editing?.name}</DialogTitle>
            <DialogDescription>Times are in {timezone.replace(/_/g, ' ')}.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="schedule-frequency">Repeat</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as 'daily' | 'weekly')}>
                  <SelectTrigger id="schedule-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Every week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule-hour">Time</Label>
                <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                  <SelectTrigger id="schedule-hour">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h)}>
                        {clock(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {frequency === 'weekly' && (
              <div className="space-y-1.5">
                <Label htmlFor="schedule-weekday">Day</Label>
                <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                  <SelectTrigger id="schedule-weekday">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="schedule-enabled">On</Label>
                <p className="text-xs text-muted-foreground">Switch off to pause the schedule without losing it.</p>
              </div>
              <Switch id="schedule-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {current ? (
              <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove} disabled={!!busy}>
                {busy === 'remove' && <Spinner />}
                Remove schedule
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={!!busy}>
                {busy === 'save' && <Spinner className="text-primary-foreground" />}
                {busy === 'save' ? 'Saving…' : 'Save schedule'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
