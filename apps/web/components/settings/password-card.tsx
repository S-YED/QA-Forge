'use client';

import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NewPasswordForm } from '@/components/settings/new-password-form';

/** G1: change your password while signed in. The shared demo account keeps its password (see SEC-4). */
export function PasswordCard({ isDemo }: { isDemo: boolean }) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">Password</CardTitle>
        <CardDescription>
          {isDemo ? 'The demo account is shared, so its password cannot be changed.' : 'Choose a new password to sign in with.'}
        </CardDescription>
      </CardHeader>
      {!isDemo && (
        <CardContent>
          <NewPasswordForm submitLabel="Change password" onDone={() => toast.success('Password changed')} />
        </CardContent>
      )}
    </Card>
  );
}
