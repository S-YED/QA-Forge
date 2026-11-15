'use client';

import { useState } from 'react';
import { KeyRound, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toastError } from '@/lib/toast-error';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Spinner } from '@/components/shared/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface ProjectVariable {
  id: string;
  name: string;
  is_secret: boolean;
  /** null for a secret: the API never sends a saved secret back. */
  value: string | null;
}

interface ProjectVariablesTabProps {
  projectId: string;
  variables: ProjectVariable[];
  /** false when the database does not have the variables table yet */
  available: boolean;
  onRefresh: () => void;
}

const NAME_RULE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** F4: values a project's steps can use as {{NAME}}. Secrets are write-only. */
export function ProjectVariablesTab({ projectId, variables, available, onRefresh }: ProjectVariablesTabProps) {
  const isDemo = useDemoMode();
  const path = `/api/projects/${projectId}/variables`;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectVariable | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [secret, setSecret] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const openDialog = (v?: ProjectVariable) => {
    if (isDemo) {
      toast.info('Demo is read-only', { description: 'Sign up to keep variables and secrets for your own projects.' });
      return;
    }
    setEditing(v ?? null);
    setName(v?.name ?? '');
    setValue(v?.value ?? '');
    setSecret(v?.is_secret ?? true);
    setOpen(true);
  };

  const nameError = name && !NAME_RULE.test(name) ? 'Capital letters, digits and underscores, starting with a letter' : '';
  // A saved secret keeps its value unless a new one is typed; making it visible needs a new value.
  const needsValue = !editing || (editing.is_secret && !secret);
  const canSave = !!name && !nameError && (!needsValue || !!value) && !saving;

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await apiClient.put(`${path}/${editing.id}`, {
          ...(name !== editing.name && { name }),
          ...(value && value !== editing.value && { value }),
          ...(secret !== editing.is_secret && { is_secret: secret }),
        });
        toast.success('Variable saved');
      } else {
        await apiClient.post(path, { name, value, is_secret: secret });
        toast.success('Variable added');
      }
      setOpen(false);
      onRefresh();
    } catch (err) {
      toastError('Could not save the variable', err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: ProjectVariable) => {
    if (!confirm(`Delete ${v.name}? Steps that use {{${v.name}}} will stop running until it is added again.`)) return;
    setDeleting(v.id);
    try {
      await apiClient.del(`${path}/${v.id}`);
      toast.success('Variable deleted');
      onRefresh();
    } catch (err) {
      toastError('Could not delete the variable', err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Variables</h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Keep logins and other test data here and use them in a step as{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{'{{NAME}}'}</code>. A secret is
            hidden in steps, logs, bug reports and exported scripts. A screenshot shows it only if the page itself does.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => openDialog()} disabled={!available} className="shrink-0">
          <Plus />
          Add variable
        </Button>
      </div>

      {!available ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Variables are not available yet. The database needs an update first.
        </p>
      ) : variables.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No variables yet"
          description='Add one, for example PASSWORD, then write a step like: Type "{{PASSWORD}}" into Password.'
          action={
            <Button onClick={() => openDialog()}>
              <Plus />
              Add variable
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
          {variables.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-mono text-sm font-medium text-foreground">{v.name}</span>
                  {v.is_secret && (
                    <Badge variant="secondary">
                      <Lock />
                      Secret
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {v.is_secret ? 'Hidden' : v.value}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openDialog(v)} aria-label={`Edit ${v.name}`} title="Edit variable">
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => remove(v)}
                disabled={deleting === v.id}
                aria-label={`Delete ${v.name}`}
                title="Delete variable"
              >
                {deleting === v.id ? <Spinner /> : <Trash2 />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add variable'}</DialogTitle>
            <DialogDescription>
              Use it in any step of this project as {'{{'}
              {name || 'NAME'}
              {'}}'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="variable-name">Name</Label>
              <Input
                id="variable-name"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase().replace(/[\s-]+/g, '_'))}
                placeholder="e.g. ADMIN_PASSWORD"
                className="font-mono"
                autoComplete="off"
                aria-invalid={!!nameError}
                autoFocus
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="variable-value">Value</Label>
              <Input
                id="variable-value"
                type={secret ? 'password' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={editing?.is_secret ? 'Leave empty to keep the saved value' : ''}
                autoComplete="new-password"
              />
              {editing?.is_secret && !secret && !value && (
                <p className="text-xs text-muted-foreground">Type a new value to make it visible. A saved secret is never shown.</p>
              )}
            </div>
            <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="variable-secret">Secret</Label>
                <p className="text-xs text-muted-foreground">Hidden everywhere after saving, and it cannot be read back.</p>
              </div>
              <Switch id="variable-secret" checked={secret} onCheckedChange={setSecret} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={!canSave}>
              {saving && <Spinner className="text-primary-foreground" />}
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add variable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
