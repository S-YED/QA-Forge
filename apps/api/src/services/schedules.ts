import type { Server } from 'socket.io';
import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';
import { isNotMigrated, startSuiteRun } from './suite-runs.js';

// F9: scheduled suite runs. A schedule says "daily (or weekly on a weekday) at this hour in this
// timezone". The API checks once a minute and starts the suite run of every schedule that is due.

export interface ScheduleRule {
  frequency: 'daily' | 'weekly';
  /** 0 to 23, in `timezone` */
  hour: number;
  /** 0 = Sunday … 6 = Saturday; weekly only */
  weekday?: number | null;
  timezone: string;
}

/** True for a timezone name the runtime knows, e.g. "Asia/Kolkata". */
export function isTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall-clock weekday, hour and minute of an instant in a timezone. */
function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: WEEKDAYS.indexOf(get('weekday')), hour: Number(get('hour')), minute: Number(get('minute')) };
}

/**
 * The first moment strictly after `after` when the rule's local time comes round.
 * ponytail: walks forward in 15-minute steps (covers half and quarter-hour timezones) for up to 8 days
 * instead of doing calendar arithmetic. On the day clocks jump forward past the chosen hour, that day
 * is skipped; when they fall back, the first of the two occurrences is used.
 */
export function nextRunAt(rule: ScheduleRule, after: Date): Date {
  const STEP = 15 * 60_000;
  let t = Math.floor(after.getTime() / STEP) * STEP + STEP;
  for (let i = 0; i < 8 * 24 * 4; i++, t += STEP) {
    const local = localParts(new Date(t), rule.timezone);
    if (local.minute === 0 && local.hour === rule.hour && (rule.frequency === 'daily' || local.weekday === rule.weekday)) {
      return new Date(t);
    }
  }
  throw new Error(`No run time found for ${JSON.stringify(rule)}`);
}

interface DueSchedule extends ScheduleRule {
  id: string;
  project_id: string;
  suite_id: string;
  user_id: string;
  next_run_at: string;
}

/**
 * Start the suite run of every enabled schedule that is due. Each one is claimed first by moving
 * `next_run_at` forward only if it still holds the value just read, so the same slot cannot be run
 * twice (by a second API instance, or by this one after a restart). A schedule that came due while
 * the API was down runs once, not once per missed slot. Returns how many suite runs were started.
 */
export async function runDueSchedules(io: Server | undefined, now = new Date()): Promise<number> {
  const { data: due, error } = await supabase
    .from('suite_schedules')
    .select('id, project_id, suite_id, user_id, frequency, hour, weekday, timezone, next_run_at')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(20);
  if (error) {
    if (isNotMigrated(error)) return 0; // migration 29 not applied yet: nothing to schedule
    throw new Error(`Could not read due schedules: ${error.message}`);
  }

  let started = 0;
  for (const schedule of (due ?? []) as DueSchedule[]) {
    const { data: claimed } = await supabase
      .from('suite_schedules')
      .update({ next_run_at: nextRunAt(schedule, now).toISOString(), last_run_at: now.toISOString() })
      .eq('id', schedule.id)
      .eq('next_run_at', schedule.next_run_at)
      .eq('enabled', true)
      .select('id');
    if (!claimed?.length) continue; // someone else took this slot

    try {
      const { batchId } = await startSuiteRun(io, schedule.user_id, schedule.project_id, schedule.suite_id);
      await supabase.from('suite_schedules').update({ last_batch_id: batchId }).eq('id', schedule.id);
      logger.info({ event: 'schedule:started', scheduleId: schedule.id, suiteId: schedule.suite_id, batchId });
      started++;
    } catch (err) {
      // e.g. the suite has no cases any more: skip this slot, keep the schedule for the next one.
      logger.warn({ event: 'schedule:skipped', scheduleId: schedule.id, suiteId: schedule.suite_id, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return started;
}

/**
 * Check for due schedules once a minute. Returns a function that stops the timer.
 * ponytail: an in-process timer, so schedules run only while the API is up; move to a job queue or
 * an external cron if the API is ever scaled to zero.
 */
export function startScheduler(io: Server | undefined, everyMs = 60_000): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    runDueSchedules(io)
      .catch((err) => logger.error({ event: 'schedule:tick_failed', error: err instanceof Error ? err.message : String(err) }))
      .finally(() => (busy = false));
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
