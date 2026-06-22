'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { ApiKeyProvider, type CreateApiKeyRequest } from '@qaforge/shared-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/spinner';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: CreateApiKeyRequest = { provider, key };
      await apiClient.post('/api/api-keys', body);
      setKey('');
      setProvider(ApiKeyProvider.OPENAI);
      toast.success('API key added');
      onAdded();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add API key';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add API key</DialogTitle>
          <DialogDescription>
            Connect an AI provider key to enable test generation.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key-provider">Provider</Label>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as ApiKeyProvider)}
            >
              <SelectTrigger id="api-key-provider">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key-value">API key</Label>
            <Input
              id="api-key-value"
              type="password"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              className="font-mono"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !key.trim()}>
              {loading && <Spinner className="text-current" />}
              {loading ? 'Adding…' : 'Add key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
