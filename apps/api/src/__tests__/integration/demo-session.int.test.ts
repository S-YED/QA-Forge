/**
 * CR-7: the demo sign-in makes a Supabase client per visit. In Node, auth-js keeps refreshing a client's session in
 * the background unless told not to, so each visit left a client that would later refresh the visitor's token on its
 * own (and pile up until restart). It must be made like the API's own client: no refresh, nothing stored.
 */
import * as supabaseJs from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ANON_KEY, useApi } from './helpers.js';

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const real = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...real, createClient: vi.fn(real.createClient) };
});

const api = useApi();

describe('CR-7 the demo sign-in client', () => {
  it('signs in without leaving a client that refreshes the session in the background', async () => {
    const createClient = vi.mocked(supabaseJs.createClient);
    createClient.mockClear();
    expect((await api('/auth/demo', '', 'POST')).status).toBe(200);
    const anon = createClient.mock.calls.filter(([, key]) => key === ANON_KEY);
    expect(anon.length).toBeGreaterThan(0);
    for (const [, , options] of anon) {
      expect(options?.auth).toMatchObject({ autoRefreshToken: false, persistSession: false });
    }
  });
});
