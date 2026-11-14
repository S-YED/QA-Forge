'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { type TestSuite } from '@qaforge/shared-types';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/shared/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface SuiteDialogProps {
  projectId: string;
  /** The suite being renamed; null creates a new one. */
  editing: TestSuite | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Create or rename a suite. Mount with a fresh `key` each time it opens so the form starts from `editing`. */
export function SuiteDialog({ projectId, editing, open, onClose, onSaved }: SuiteDialogProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await apiClient.put(`/api/projects/${projectId}/test-suites/${editing.id}`, {
          name: name.trim(),
          description: description.trim() || null,
        });
        toast.success('Suite saved');
      } else {
        await apiClient.post(`/api/projects/${projectId}/test-suites`, {
          name: name.trim(),
          description: description.trim() || undefined,
        });
        toast.success('Suite created');
      }
      onClose();
      onSaved();
    } catch (err) {
      toastError(editing ? 'Could not save the suite' : 'Could not create the suite', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Rename test suite' : 'Create test suite'}</DialogTitle>
          <DialogDescription>Organize your test cases into logical suites.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="suite-name">
              Suite name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="suite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Authentication tests"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="suite-description">Description</Label>
            <Textarea
              id="suite-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || !name.trim()}>
            {saving && <Spinner className="text-primary-foreground" />}
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create suite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
