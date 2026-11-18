'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';
import { toastError } from '@/lib/toast-error';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { Spinner } from '@/components/shared/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** G2: delete your account and everything in it. The shared demo account cannot be deleted. */
export function DeleteAccountCard({ isDemo }: { isDemo: boolean }) {
  const ask = useConfirm();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    const yes = await ask({
      title: 'Delete your account?',
      description:
        'Your projects, suites, test cases, runs, bugs, recordings, schedules, keys and tokens are deleted with it. This cannot be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!yes) return;
    setDeleting(true);
    try {
      await apiClient.del('/api/auth/me');
      await createClient().auth.signOut();
      toast.success('Your account was deleted');
      router.push('/login');
    } catch (err) {
      toastError('Could not delete your account', err);
      setDeleting(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">Delete account</CardTitle>
        <CardDescription>
          {isDemo
            ? 'The demo account is shared, so it cannot be deleted.'
            : 'Delete your account and everything in it. This cannot be undone.'}
        </CardDescription>
      </CardHeader>
      {!isDemo && (
        <CardContent>
          <Button variant="destructive" onClick={remove} disabled={deleting}>
            {deleting && <Spinner className="text-destructive-foreground" />}
            {deleting ? 'Deleting…' : 'Delete account'}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
