import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/supabase.js', () => ({ supabase: {} }));

const { isTimezone, nextRunAt } = await import('../services/schedules.js');

const at = (iso: string) => new Date(iso);
const next = (rule: Parameters<typeof nextRunAt>[0], after: string) => nextRunAt(rule, at(after)).toISOString();

describe('when a schedule next runs (F9)', () => {
  it('daily, in UTC: later today if the hour is still ahead, otherwise tomorrow', () => {
    const rule = { frequency: 'daily' as const, hour: 9, timezone: 'UTC' };
    expect(next(rule, '2026-11-16T03:10:00Z')).toBe('2026-11-16T09:00:00.000Z');
    expect(next(rule, '2026-11-16T09:00:00Z')).toBe('2026-11-17T09:00:00.000Z'); // strictly after: never the same slot twice
    expect(next(rule, '2026-11-16T22:59:00Z')).toBe('2026-11-17T09:00:00.000Z');
  });

  it('uses the wall clock of the timezone, including half-hour ones', () => {
    // 09:00 in India (UTC+5:30) is 03:30 UTC
    expect(next({ frequency: 'daily', hour: 9, timezone: 'Asia/Kolkata' }, '2026-11-16T00:00:00Z')).toBe('2026-11-16T03:30:00.000Z');
    expect(next({ frequency: 'daily', hour: 9, timezone: 'Asia/Kolkata' }, '2026-11-16T03:30:00Z')).toBe('2026-11-17T03:30:00.000Z');
    // 06:00 in Kathmandu (UTC+5:45) is 00:15 UTC
    expect(next({ frequency: 'daily', hour: 6, timezone: 'Asia/Kathmandu' }, '2026-11-16T00:00:00Z')).toBe('2026-11-16T00:15:00.000Z');
  });

  it('weekly: the next such weekday, a full week later when today has passed', () => {
    const monday9 = { frequency: 'weekly' as const, hour: 9, weekday: 1, timezone: 'UTC' };
    expect(next(monday9, '2026-11-16T08:00:00Z')).toBe('2026-11-16T09:00:00.000Z'); // 16 Nov 2026 is a Monday
    expect(next(monday9, '2026-11-16T09:30:00Z')).toBe('2026-11-23T09:00:00.000Z');
    expect(next({ ...monday9, weekday: 5 }, '2026-11-16T09:30:00Z')).toBe('2026-11-20T09:00:00.000Z');
    // The weekday is the local one: Monday 01:00 in Tokyo is still Sunday in UTC.
    expect(next({ frequency: 'weekly', hour: 1, weekday: 1, timezone: 'Asia/Tokyo' }, '2026-11-14T00:00:00Z')).toBe('2026-11-15T16:00:00.000Z');
  });

  it('follows daylight saving: the same local hour before and after the clocks change', () => {
    const ny8 = { frequency: 'daily' as const, hour: 8, timezone: 'America/New_York' };
    expect(next(ny8, '2026-10-31T13:00:00Z')).toBe('2026-11-01T13:00:00.000Z'); // clocks went back at 06:00Z: 08:00 EST
    expect(next(ny8, '2026-10-30T13:00:00Z')).toBe('2026-10-31T12:00:00.000Z'); // 08:00 EDT
    // 02:00 does not exist on the spring-forward day (8 Mar 2026): that day is skipped.
    expect(next({ ...ny8, hour: 2 }, '2026-03-07T08:00:00Z')).toBe('2026-03-09T06:00:00.000Z');
  });

  it('knows a real timezone from a made-up one', () => {
    expect(isTimezone('Asia/Kolkata')).toBe(true);
    expect(isTimezone('UTC')).toBe(true);
    expect(isTimezone('Mars/Olympus')).toBe(false);
  });
});
