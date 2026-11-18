import { supabase } from '../config/supabase.js';
import { screenshotsOfRuns } from '../utils/artifacts.js';
import { closeRecordingSession } from '../websocket/handlers/recording.handler.js';
import { STOPPED, stopRuns } from './run-executor.js';

/**
 * Before the rows of an account (G2) or a project (G10) are deleted, nothing of it may still be working: queued runs are
 * closed so no suite run starts them, running ones are stopped and waited for (they upload screenshots as they go), and
 * live recordings are closed. Returns the screenshot paths its runs stored, to remove once the rows are gone.
 * ponytail: a schedule firing in this instant can still start a suite run; its rows cascade away with the rest.
 */
export async function windDown(column: 'user_id' | 'project_id', id: string): Promise<string[]> {
  await supabase
    .from('test_runs')
    .update({ status: 'error', error_message: STOPPED, completed_at: new Date().toISOString() })
    .eq(column, id)
    .eq('status', 'pending');
  const [{ data: running }, { data: recordings }] = await Promise.all([
    supabase.from('test_runs').select('id').eq(column, id).eq('status', 'running'),
    supabase.from('recorded_sessions').select('id').eq(column, id).eq('status', 'recording'),
  ]);
  await Promise.all([
    stopRuns((running ?? []).map((r) => r.id)),
    ...(recordings ?? []).map((r) => closeRecordingSession(r.id)),
  ]);
  return screenshotsOfRuns(column, id);
}
