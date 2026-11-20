import { createClient } from '@/lib/supabase/client';
import { sendSocketToken } from '@/lib/socket-token';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** What a request that got no answer at all says (the browser's own text is "Failed to fetch"). */
export const UNREACHABLE = "Can't reach the QA Forge server. Check your connection, then try again.";

/** fetch rejects only when the request never got an answer: the server is down or the network is gone (U4). */
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new Error(UNREACHABLE);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

/**
 * The live connection's `auth` (G7). socket.io calls it on every connection attempt, so a reconnect sends the session's
 * current token (refreshed by Supabase), not the one the page opened with, which expires after an hour.
 */
export function socketAuth(cb: (data: { token?: string }) => void): void {
  sendSocketToken(createClient().auth.getSession(), cb);
}

/**
 * Flatten the API's validation details (a Zod `format()` tree) into readable lines,
 * e.g. { steps: { 2: { value: { _errors: ['Required'] } } } } → "Step 3 value: Required".
 */
function fieldErrors(details: unknown, path: string[] = []): string[] {
  if (!details || typeof details !== 'object') return [];
  const node = details as Record<string, unknown>;
  const own = Array.isArray(node._errors) && node._errors.length && path.length
    ? [`${path.join(' ').replace(/^steps (\d+)/, (_, n) => `Step ${Number(n) + 1}`)}: ${node._errors[0]}`]
    : [];
  return own.concat(
    ...Object.entries(node)
      .filter(([k]) => k !== '_errors')
      .map(([k, v]) => fieldErrors(v, [...path, k])),
  );
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
    throw new Error('Unauthorized - session expired');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    // The API wraps errors as { error: { code, message, details } } (see
    // apps/api error-handler + 404 handler). Prefer that nested message, then
    // a top-level message, then a generic fallback.
    const message =
      errorBody?.error?.message ??
      errorBody?.message ??
      response.statusText ??
      `Request failed: ${response.status}`;
    const fields = fieldErrors(errorBody?.error?.details);
    throw new Error(fields.length ? `${message}: ${fields.slice(0, 3).join('; ')}` : message);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  async get<T>(path: string): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await send(path, {
      method: 'GET',
      headers,
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await send(path, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await send(path, {
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async del<T>(path: string): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await send(path, {
      method: 'DELETE',
      headers,
    });
    return handleResponse<T>(res);
  },
};
