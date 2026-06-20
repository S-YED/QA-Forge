import { createClient } from '@/lib/supabase/client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
    throw new Error(message);
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
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async del<T>(path: string): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse<T>(res);
  },
};
