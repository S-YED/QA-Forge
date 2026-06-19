'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { ApiKeyProvider, type CreateApiKeyRequest } from '@qaforge/shared-types';

interface AddApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const providers = [
  { value: ApiKeyProvider.OPENAI, label: 'OpenAI' },
  { value: ApiKeyProvider.ANTHROPIC, label: 'Anthropic' },
  { value: ApiKeyProvider.GEMINI, label: 'Gemini' },
  { value: ApiKeyProvider.OPENROUTER, label: 'OpenRouter' },
];

export function AddApiKeyModal({ open, onClose, onAdded }: AddApiKeyModalProps) {
  const [provider, setProvider] = useState<ApiKeyProvider>(ApiKeyProvider.OPENAI);
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: CreateApiKeyRequest = { provider, key };
      await apiClient.post('/api/api-keys', body);
      setKey('');
      setProvider(ApiKeyProvider.OPENAI);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add API key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add API Key</h2>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="api-key-provider"
              className="text-sm font-medium leading-none"
            >
              Provider
            </label>
            <select
              id="api-key-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ApiKeyProvider)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {providers.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="api-key-value"
              className="text-sm font-medium leading-none"
            >
              API Key
            </label>
            <input
              id="api-key-value"
              type="password"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !key.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'Adding...' : 'Add Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
