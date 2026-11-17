'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/spinner';

/**
 * DD-5: where the password-reset email lands. Opening the link signs the person in; here they choose the
 * password they will use from now on. Before this page the link only signed them in once.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [state, setState] = useState<'checking' | 'ready' | 'expired'>('checking');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // getSession waits until the client has turned the code in the link into a session (or failed to).
    void supabase.auth.getSession().then(({ data }) => setState(data.session ? 'ready' : 'expired'));
  }, [supabase]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error: refused } = await supabase.auth.updateUser({ password });
    if (refused) {
      setError(refused.message);
      setSaving(false);
      return;
    }
    toast.success('Password changed');
    router.push('/dashboard/projects');
  };

  if (state === 'checking') {
    return (
      <div className="flex justify-center py-10" role="status" aria-label="Opening your reset link">
        <Spinner />
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <Card className="w-full shadow-sm">
        <CardHeader className="items-center gap-2 pb-2 text-center">
          <CardTitle className="text-xl">This reset link no longer works</CardTitle>
          <CardDescription>
            A reset link works once, for a limited time, in the browser where you asked for it. Ask for a new one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/login?view=forgotten_password">Send a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="items-center gap-2 pb-2 text-center">
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>You will sign in with it from now on.</CardDescription>
      </CardHeader>
      <CardContent>
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
          <Button type="submit" className="w-full" disabled={saving || !password}>
            {saving && <Spinner className="text-current" />}
            {saving ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
