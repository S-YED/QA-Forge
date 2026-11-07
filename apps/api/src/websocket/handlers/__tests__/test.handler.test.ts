// UI-1: test:join acknowledges only after the socket is in the run's room (so the client's
// reload can't miss events), and refuses runs the user doesn't own.
import { describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';

const single = vi.fn();
vi.mock('../../../config/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single }) }) }) }) },
}));

const { registerTestHandlers } = await import('../test.handler.js');

function fakeSocket() {
  const events: string[] = [];
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const socket = {
    data: { userId: 'user-1' },
    on: (event: string, fn: (...args: unknown[]) => unknown) => void (handlers[event] = fn),
    emit: (event: string) => void events.push(`emit ${event}`),
    join: async (room: string) => {
      await new Promise((r) => setTimeout(r, 10)); // joining is async; the ack must wait for it
      events.push(`join ${room}`);
    },
  };
  registerTestHandlers({} as Server, socket as unknown as Socket);
  const join = (ack?: (res: { ok: boolean }) => void) => handlers['test:join']({ test_run_id: 'run-1' }, ack);
  return { events, join };
}

describe('test:join', () => {
  it('acks ok only after joining the room', async () => {
    single.mockResolvedValueOnce({ data: { id: 'run-1' }, error: null });
    const { events, join } = fakeSocket();
    await join((res) => void events.push(`ack ${res.ok}`));
    expect(events).toEqual(['join test:run-1', 'ack true']);
  });

  it("refuses another user's run without joining", async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: 'no rows' } });
    const { events, join } = fakeSocket();
    await join((res) => void events.push(`ack ${res.ok}`));
    expect(events).toEqual(['emit test:unauthorized', 'ack false']);
  });

  it('still works for clients that send no ack', async () => {
    single.mockResolvedValueOnce({ data: { id: 'run-1' }, error: null });
    const { events, join } = fakeSocket();
    await join();
    expect(events).toEqual(['join test:run-1']);
  });
});
