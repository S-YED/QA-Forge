'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/shared/spinner';
import { NewPasswordForm } from '@/components/settings/new-password-form';

/**
 * DD-5: where the password-reset email lands. Opening the link signs the person in; here they choose the
 * password they will use from now on. Before this page the link only signed them in once.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [state, setState] = useState<'checking' | 'ready' | 'expired'>('checking');

  useEffect(() => {
    // getSession waits until the client has turned the code in the link into a session (or failed to).
    void supabase.auth.getSession().then(({ data }) => setState(data.session ? 'ready' : 'expired'));
  }, [supabase]);

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
        <NewPasswordForm
          submitLabel="Set new password"
          fullWidth
          onDone={() => {
            toast.success('Password changed');
            router.push('/dashboard/projects');
          }}
        />
      </CardContent>
    </Card>
  );
}
