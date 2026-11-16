'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toastError } from '@/lib/toast-error';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/shared/spinner';

interface NotificationSettings {
  /** false until the database has migration 31 */
  available: boolean;
  slack: { configured: boolean; hint?: string };
}

const PREFIX = 'https://hooks.slack.com/services/';

/** F10: post to a Slack channel when a suite run of this project ends with failures. The address is write-only. */
export function SlackNotifications({ projectId }: { projectId: string }) {
  const isDemo = useDemoMode();
  const path = `/api/projects/${projectId}/notifications`;
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await apiClient.get<NotificationSettings>(path));
    } catch (err) {
      toastError('Could not load the notification settings', err);
      setSettings({ available: true, slack: { configured: false } });
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (kind: 'save' | 'test' | 'remove', fn: () => Promise<unknown>, done: string, failed: string) => {
    if (isDemo) {
      toast.info('Demo is read-only', { description: 'Sign up to connect your own Slack channel.' });
      return;
    }
    setBusy(kind);
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (err) {
      toastError(failed, err);
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    act(
      'save',
      async () => {
        await apiClient.put(`${path}/slack`, { webhook_url: address.trim() });
        setAddress('');
      },
      'Slack address saved',
      'Could not save the Slack address',
    );
  const test = () => act('test', () => apiClient.post(`${path}/slack/test`, {}), 'Test message sent. Check the channel.', 'Slack did not take the test message');
  const remove = () => {
    if (!confirm('Stop posting to Slack for this project? The saved address is deleted.')) return;
    return act('remove', () => apiClient.del(`${path}/slack`), 'Slack notices turned off', 'Could not remove the Slack address');
  };

  const looksRight = address.trim().startsWith(PREFIX) && address.trim().length > PREFIX.length;
  const configured = settings?.slack.configured;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Slack notice on failure</h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          When a suite run ends with a failed test case, QA Forge posts the result to a Slack channel. Runs you start,
          scheduled runs and runs from your build system all count. Nothing is posted when everything passes.
        </p>
      </div>

      {settings === null ? (
        <div className="flex justify-center py-8">
          <Spinner className="text-primary" />
        </div>
      ) : !settings.available ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Notifications are not available yet. The database needs an update first.
        </p>
      ) : (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          {configured && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Badge variant="success">Connected</Badge>
              <span className="text-sm text-muted-foreground">
                Saved address ends in <span className="font-mono text-foreground">{settings.slack.hint}</span>
              </span>
              <div className="flex gap-2 sm:ml-auto">
                <Button variant="outline" size="sm" onClick={test} disabled={!!busy}>
                  {busy === 'test' && <Spinner />}
                  {busy === 'test' ? 'Sending…' : 'Send a test message'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={remove}
                  disabled={!!busy}
                >
                  {busy === 'remove' && <Spinner />}
                  Remove
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="slack-webhook">{configured ? 'Replace the address' : 'Slack incoming-webhook address'}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="slack-webhook"
                type="password"
                autoComplete="off"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={`${PREFIX}...`}
                maxLength={500}
                className="font-mono text-sm"
              />
              <Button onClick={save} disabled={!looksRight || !!busy} className="shrink-0">
                {busy === 'save' && <Spinner className="text-primary-foreground" />}
                {busy === 'save' ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              In Slack, create an incoming webhook for the channel and paste its address here. It starts with{' '}
              <span className="font-mono">{PREFIX}</span>. It is stored encrypted and never shown again.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
