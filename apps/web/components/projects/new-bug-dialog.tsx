'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/shared/spinner';

const SEVERITIES = [
  ['critical', 'Critical'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
] as const;

/** G5: file a bug found by hand (runs file theirs on their own). Uses the existing POST /bugs. */
export function NewBugDialog({ projectId, open, onClose, onFiled }: { projectId: string; open: boolean; onClose: () => void; onFiled: () => void }) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [actual, setActual] = useState('');
  const [expected, setExpected] = useState('');
  const [steps, setSteps] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setSeverity('medium');
    setActual('');
    setExpected('');
    setSteps('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post(`/api/projects/${projectId}/bugs`, {
        title: title.trim(),
        severity,
        actual_behavior: actual.trim() || undefined,
        expected_behavior: expected.trim() || undefined,
        steps_to_reproduce: steps.trim() || undefined,
      });
      toast.success('Bug filed');
      reset();
      onFiled();
      onClose();
    } catch (err) {
      toastError('Could not file the bug', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>File a bug</DialogTitle>
          <DialogDescription>For something you found yourself. A failed run files its own bug.</DialogDescription>
        </DialogHeader>
        <form id="new-bug" onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bug-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input id="bug-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bug-severity">Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger id="bug-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bug-actual">What happened</Label>
            <Textarea id="bug-actual" value={actual} onChange={(e) => setActual(e.target.value)} maxLength={2000} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bug-expected">What should happen</Label>
            <Textarea id="bug-expected" value={expected} onChange={(e) => setExpected(e.target.value)} maxLength={2000} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bug-steps">Steps to reproduce</Label>
            <Textarea id="bug-steps" value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={5000} rows={3} />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-bug" disabled={saving || !title.trim()}>
            {saving && <Spinner className="text-current" />}
            {saving ? 'Filing…' : 'File bug'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
