'use client';

import { useState } from 'react';
import { Plus, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { AddApiKeyModal } from '@/components/settings/add-api-key-modal';
import type { ApiKeyResponse } from '@qaforge/shared-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Spinner } from '@/components/shared/spinner';

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
      toast.success('Key validated');
    } catch {
      toast.error('Could not validate key');
    } finally {
      setValidatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.del(`/api/api-keys/${id}`);
      await refreshKeys();
      toast.success('Key deleted');
    } catch {
      toast.error('Could not delete key');
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
      openrouter: 'OpenRouter',
    };
    return labels[provider] ?? provider;
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus />
          Add key
        </Button>
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys configured"
          description="Add your AI provider API keys to enable test generation."
          action={
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus />
              Add API key
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Provider
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Key hint
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {providerLabel(key.provider)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                    ••••{key.key_hint ?? '****'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={key.is_valid ? 'success' : 'warning'}>
                      {key.is_valid ? 'Valid' : 'Unverified'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleValidate(key.id)}
                        disabled={validatingId === key.id}
                      >
                        {validatingId === key.id && <Spinner className="text-current" />}
                        {validatingId === key.id ? 'Validating…' : 'Validate'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(key.id)}
                        disabled={deletingId === key.id}
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        {deletingId === key.id && <Spinner className="text-current" />}
                        {deletingId === key.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <AddApiKeyModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdded={handleKeyAdded}
      />
    </>
  );
}
