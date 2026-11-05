// Shared helpers for integration tests (real local Supabase + in-process API).
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll } from 'vitest';
import app from '../../app.js';

export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export const USERS = {
  alice: { email: 'alice@qaforge.dev', password: 'Password123!' },
  bob: { email: 'bob@qaforge.dev', password: 'Password123!' },
  demo: { email: 'demo@qaforge.dev', password: 'DemoPassword123!' },
};

export async function signIn(user: { email: string; password: string }) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  const body = (await res.json()) as { access_token?: string; user?: { id: string } };
  if (!body.access_token || !body.user) throw new Error(`sign-in failed for ${user.email}`);
  return { token: body.access_token, id: body.user.id };
}

/** Starts the API in-process for the calling test file; returns a fetch helper bound to it. */
export function useApi() {
  let server: http.Server;
  let apiBase = '';
  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    apiBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  return (path: string, token: string, method = 'GET', body?: unknown) =>
    fetch(`${apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}
