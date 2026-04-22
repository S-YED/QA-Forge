import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AiKeysManager } from '@/components/settings/ai-keys-manager';
import type { ApiKeyResponse } from '@qaforge/shared-types';

/** Matches GET /api/api-keys response shape from the backend */
interface ApiKeysListResponse {
  keys: ApiKeyResponse[];
}

async function getApiKeys(accessToken: string): Promise<ApiKeyResponse[]> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const res = await fetch(`${baseUrl}/api/api-keys`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return [];
  }

  const data: ApiKeysListResponse = await res.json();
  return data.keys ?? [];
}

export default async function AiKeysPage() {
  const supabase = createServerSupabaseClient();

  // getUser() makes a live network call to validate the token (safe on server).
  // getSession() only reads the cookie — do NOT use it alone for auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const apiKeys = user && session?.access_token
    ? await getApiKeys(session.access_token)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Keys</h1>
        <p className="text-muted-foreground mt-1">
          Manage your AI provider API keys for test generation
        </p>
      </div>
      <AiKeysManager initialKeys={apiKeys} />
    </div>
  );
}
