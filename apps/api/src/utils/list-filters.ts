import { z } from 'zod';

// F6: shared pieces of the list filters (runs, bugs, case search).

/** `days=7` means "created in the last 7 days". */
export const daysParam = z.coerce.number().int().min(1).max(365).optional();

/** What the user typed in a search box. */
export const searchParam = z.string().trim().min(1).max(100);

export const sinceIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * A PostgREST `or(...)` expression: any of `columns` contains `q`, ignoring case. The text is matched
 * literally: LIKE wildcards are escaped, and the value is double-quoted so commas, brackets and dots in it
 * cannot add conditions to the filter. (PostgREST itself reads `*` as "anything"; that is harmless here.)
 */
export function containsAny(columns: string[], q: string): string {
  const like = q.replace(/[\\%_]/g, '\\$&');
  const quoted = `"%${like.replace(/[\\"]/g, '\\$&')}%"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(',');
}
