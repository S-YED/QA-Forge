'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/spinner';

/**
 * Sets the signed-in person's password (Supabase `updateUser`). Used by `/reset-password` (DD-5) and by
 * Settings, Profile (G1). Supabase's own refusal (too short, same as before, sign in again) is shown as is.
 */
export function NewPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const [supabase] = useState(createClient);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error: refused } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (refused) {
      setError(refused.message);
      return;
    }
    setPassword('');
    onDone();
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          aria-invalid={!!error}
          aria-describedby={error ? 'new-password-error' : undefined}
        />
        {error && (
          <p id="new-password-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={saving || !password}>
        {saving && <Spinner className="text-current" />}
        {saving ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
