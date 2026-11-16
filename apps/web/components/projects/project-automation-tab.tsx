'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toastError } from '@/lib/toast-error';
import { Button } from '@/components/ui/button';
import { SuiteSchedules } from '@/components/projects/suite-schedules';
import { SlackNotifications } from '@/components/projects/slack-notifications';
import { EmptyState } from '@/components/shared/empty-state';
import { Spinner } from '@/components/shared/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ProjectToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

interface ProjectAutomationTabProps {
  projectId: string;
  suites: { id: string; name: string }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

/** A GitHub Actions step that starts the suite, waits for it and fails the job unless every case passed. */
function workflowSnippet(suiteId: string) {
  return `- name: Run QA Forge suite
  env:
    QAFORGE_TOKEN: \${{ secrets.QAFORGE_TOKEN }}
    QAFORGE_API: ${API_URL}
    QAFORGE_SUITE: ${suiteId}
  run: |
    start=$(curl -fsS -X POST "$QAFORGE_API/api/ci/suites/$QAFORGE_SUITE/run" -H "Authorization: Bearer $QAFORGE_TOKEN")
    batch=$(echo "$start" | jq -r .batch_id)
    while :; do
      result=$(curl -fsS "$QAFORGE_API/api/ci/batches/$batch" -H "Authorization: Bearer $QAFORGE_TOKEN")
      status=$(echo "$result" | jq -r .status)
      [ "$status" != "running" ] && break
      sleep 5
    done
    echo "$result" | jq -r '.runs[] | "\\(.status)\\t\\(.title)"'
    [ "$status" = "passed" ]`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={label}>
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** F8: project tokens for build systems, and the snippet that uses one. */
export function ProjectAutomationTab({ projectId, suites }: ProjectAutomationTabProps) {
  const isDemo = useDemoMode();
  const path = `/api/projects/${projectId}/tokens`;
  const [tokens, setTokens] = useState<ProjectToken[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  /** The new token, shown once in the dialog and never fetched again. */
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [suiteId, setSuiteId] = useState(suites[0]?.id ?? '');

  // Once the dialog has closed, forget the token: it must not linger in the page or in memory.
  useEffect(() => {
    if (open || !secret) return;
    const timer = setTimeout(() => setSecret(null), 300); // after the closing animation
    return () => clearTimeout(timer);
  }, [open, secret]);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<{ tokens: ProjectToken[]; available: boolean }>(path);
      setTokens(data.tokens ?? []);
      setAvailable(data.available !== false);
    } catch (err) {
      setTokens([]);
      toastError('Could not load the tokens', err);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDialog = () => {
    if (isDemo) {
      toast.info('Demo is read-only', { description: 'Sign up to run your suites from your own build system.' });
      return;
    }
    setName('');
    setSecret(null);
    setOpen(true);
  };

  const create = async () => {
    setSaving(true);
    try {
      const data = await apiClient.post<{ secret: string }>(path, { name: name.trim() });
      setSecret(data.secret);
      void load();
    } catch (err) {
      toastError('Could not create the token', err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: ProjectToken) => {
    if (!confirm(`Delete the token "${t.name}"? Any build that uses it will stop being able to run suites.`)) return;
    setDeleting(t.id);
    try {
      await apiClient.del(`${path}/${t.id}`);
      toast.success('Token deleted');
      void load();
    } catch (err) {
      toastError('Could not delete the token', err);
    } finally {
      setDeleting(null);
    }
  };

  const snippet = workflowSnippet(suiteId || 'SUITE_ID');

  return (
    <div className="space-y-8">
      <SuiteSchedules projectId={projectId} suites={suites} />

      <SlackNotifications projectId={projectId} />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Tokens for your build system</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              A token lets a build, such as GitHub Actions, run the suites of this project and read the results. It works
              for this project only and can be deleted at any time.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={openDialog} disabled={!available} className="shrink-0 self-start">
            <Plus />
            New token
          </Button>
        </div>

        {tokens === null ? (
          <div className="flex justify-center py-8">
            <Spinner className="text-primary" />
          </div>
        ) : !available ? (
          <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            Tokens are not available yet. The database needs an update first.
          </p>
        ) : tokens.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No tokens yet"
            description="Create one, store it as a secret in your build system, and use the step below."
            action={
              <Button onClick={openDialog}>
                <Plus />
                New token
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{t.token_prefix}…</span> · created {day(t.created_at)} · last used {day(t.last_used_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => remove(t)}
                  disabled={deleting === t.id}
                  aria-label={`Delete token ${t.name}`}
                  title="Delete token"
                >
                  {deleting === t.id ? <Spinner /> : <Trash2 />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Run a suite from GitHub Actions</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Save the token as a repository secret named QAFORGE_TOKEN, then add this step to a workflow. The job fails
            unless every test case passes.
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full space-y-1.5 sm:w-72">
            <Label htmlFor="automation-suite">Suite</Label>
            <Select value={suiteId} onValueChange={setSuiteId} disabled={suites.length === 0}>
              <SelectTrigger id="automation-suite">
                <SelectValue placeholder={suites.length ? 'Choose a suite' : 'Create a suite first'} />
              </SelectTrigger>
              <SelectContent>
                {suites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CopyButton text={snippet} label="Copy the workflow step" />
        </div>
        <pre
          className="scrollbar-console max-h-96 overflow-auto rounded-lg border border-console-border bg-console p-4 font-mono text-xs leading-relaxed text-console-foreground"
          tabIndex={0}
          aria-label="GitHub Actions workflow step"
        >
          {snippet}
        </pre>
      </section>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{secret ? 'Copy your token now' : 'New token'}</DialogTitle>
            <DialogDescription>
              {secret
                ? 'This is the only time it is shown. Store it as a secret in your build system.'
                : 'Name it after where it will be used, so you know which one to delete later.'}
            </DialogDescription>
          </DialogHeader>

          {secret ? (
            <div className="space-y-3">
              <Label htmlFor="token-secret">Token</Label>
              <div className="flex gap-2">
                <Input id="token-secret" readOnly value={secret} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <CopyButton text={secret} label="Copy the token" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GitHub Actions"
                maxLength={80}
                autoFocus
              />
            </div>
          )}

          <DialogFooter>
            {secret ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={create} disabled={saving || !name.trim()}>
                  {saving && <Spinner className="text-primary-foreground" />}
                  {saving ? 'Creating…' : 'Create token'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
