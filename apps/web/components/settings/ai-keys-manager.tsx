'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { AddApiKeyModal } from '@/components/settings/add-api-key-modal';
import type { ApiKeyResponse } from '@qaforge/shared-types';

/** Matches GET /api/api-keys response shape from the backend */
interface ApiKeysListResponse {
  keys: ApiKeyResponse[];
}

interface AiKeysManagerProps {
  initialKeys: ApiKeyResponse[];
}

export function AiKeysManager({ initialKeys }: AiKeysManagerProps) {
  const [keys, setKeys] = useState<ApiKeyResponse[]>(initialKeys);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshKeys = async () => {
    try {
      const data = await apiClient.get<ApiKeysListResponse>('/api/api-keys');
      setKeys(data.keys ?? []);
    } catch {
      // apiClient handles 401
    }
  };

  const handleValidate = async (id: string) => {
    setValidatingId(id);
    try {
      await apiClient.post(`/api/api-keys/${id}/validate`);
      await refreshKeys();
    } catch {
      // noop
    } finally {
      setValidatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.del(`/api/api-keys/${id}`);
      await refreshKeys();
    } catch {
      // noop
    } finally {
      setDeletingId(null);
    }
  };

  const handleKeyAdded = async () => {
    setIsModalOpen(false);
    await refreshKeys();
  };

  const providerLabel = (provider: string) => {
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      gemini: 'Gemini',
    };
    return labels[provider] ?? provider;
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Add Key
        </button>
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground/50 mb-4"
          >
            <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
            <path d="m21 2-9.6 9.6" />
            <circle cx="7.5" cy="15.5" r="5.5" />
          </svg>
          <h3 className="text-lg font-semibold">No API keys configured</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Add your AI provider API keys to enable test generation.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Add API Key
          </button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                  Provider
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                  Key Hint
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-sm font-medium">
                    {providerLabel(key.provider)}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                    ••••{key.key_hint ?? '****'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        key.is_valid
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}
                    >
                      {key.is_valid ? 'Valid' : 'Unverified'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => handleValidate(key.id)}
                        disabled={validatingId === key.id}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        {validatingId === key.id ? 'Validating...' : 'Validate'}
                      </button>
                      <button
                        onClick={() => handleDelete(key.id)}
                        disabled={deletingId === key.id}
                        className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                      >
                        {deletingId === key.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddApiKeyModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdded={handleKeyAdded}
      />
    </>
  );
}
