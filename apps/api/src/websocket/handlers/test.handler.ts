import type { Server, Socket } from 'socket.io';
import { supabase } from '../../config/supabase.js';

/**
 * Sockets only observe runs (TD-3). Execution is started by HTTP routes via
 * services/run-executor.ts, which emits to the `test:<run id>` room.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerTestHandlers(_io: Server, socket: Socket): void {
  // Validate ownership before allowing a socket to subscribe to run events.
  // An attacker emitting 'test:join' for another user's run ID must not receive
  // any broadcasts emitted to that room.
  // The optional ack fires once the socket is in the room, so a client can then load the
  // run from the API without missing events emitted between its load and the join (UI-1).
  socket.on('test:join', async (payload: { test_run_id: string }, ack?: (res: { ok: boolean }) => void) => {
    const userId = socket.data.userId as string;
    const { test_run_id } = payload;

    const { data: run, error } = await supabase
      .from('test_runs')
      .select('id')
      .eq('id', test_run_id)
      .eq('user_id', userId)
      .single();

    if (error || !run) {
      socket.emit('test:unauthorized', { test_run_id, message: 'Unauthorized' });
      if (typeof ack === 'function') ack({ ok: false });
      return;
    }

    await socket.join(`test:${test_run_id}`);
    if (typeof ack === 'function') ack({ ok: true });
  });
}
