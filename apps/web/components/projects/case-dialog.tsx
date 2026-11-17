'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { type StepAction, type TestCase } from '@qaforge/shared-types';
import { apiClient } from '@/lib/api/client';
import {
  StepRow,
  isBlankStep,
  newDraftStep,
  stepErrors,
  stepInputId,
  toSavedStep,
  type DraftStep,
  type StepErrors,
} from '@/components/projects/step-row';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/shared/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Priority = 'critical' | 'high' | 'medium' | 'low';

interface CaseDialogProps {
  projectId: string;
  suiteId: string;
  /** The case being edited (UI-2); null creates a new one. */
  editing: TestCase | null;
  open: boolean;
  onClose: () => void;
  /** Called after a successful save, before the dialog closes; a failure here is reported as a failed save. */
  onSaved: () => Promise<void>;
}

/** Saved steps as editable drafts. Legacy rows without an action open with none chosen, so the editor asks instead of guessing. */
function draftSteps(tc: TestCase | null): DraftStep[] {
  const steps = (tc?.steps ?? []) as { action?: string; instruction?: string; selector?: string; value?: string }[];
  return steps.length
    ? steps.map((s) => ({
        action: (s.action as StepAction | undefined) ?? '',
        instruction: s.instruction ?? '',
        selector: s.selector ?? '',
        value: s.value ?? '',
      }))
    : [newDraftStep()];
}

/** Create or edit a test case. Mount with a fresh `key` each time it opens so the form starts from `editing`. */
export function CaseDialog({ projectId, suiteId, editing, open, onClose, onSaved }: CaseDialogProps) {
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [expected, setExpected] = useState(editing?.expected_result ?? '');
  const [priority, setPriority] = useState<Priority>((editing?.priority as Priority) ?? 'medium');
  const [type, setType] = useState<string>(editing?.type ?? 'functional');
  const [steps, setSteps] = useState<DraftStep[]>(() => draftSteps(editing));
  // Per-step field errors, shown next to the fields after a save attempt (null = not checked yet).
  const [errors, setErrors] = useState<StepErrors[] | null>(null);

  // F6: swap two steps; they are numbered by position when saved.
  const moveStep = (from: number, to: number) => {
    const next = [...steps];
    [next[from], next[to]] = [next[to], next[from]];
    setSteps(next);
  };

  // U3: typing speed. Focus moves after React has drawn the step it points at.
  const focusStep = (idx: number) => requestAnimationFrame(() => document.getElementById(stepInputId(idx + 1))?.focus());
  // Enter: on to the next step, adding one after the last unless the last is still empty.
  const enterOn = (idx: number) => {
    if (idx === steps.length - 1) {
      if (isBlankStep(steps[idx])) return;
      setSteps([...steps, newDraftStep()]);
    }
    focusStep(idx + 1);
  };
  // Several pasted lines: they replace an empty step, else go after it.
  const pasteAt = (idx: number, lines: DraftStep[]) => {
    const replace = isBlankStep(steps[idx]) ? 1 : 0;
    setSteps([...steps.slice(0, idx + 1 - replace), ...lines, ...steps.slice(idx + 1)]);
    focusStep(idx - replace + lines.length);
  };

  // U3: closing with changes asks first, in the app and when leaving the page.
  const snapshot = JSON.stringify([title, description, expected, priority, type, steps]);
  const [initial] = useState(snapshot);
  const dirty = snapshot !== initial;
  const requestClose = () => {
    if (!dirty || confirm('Discard your changes to this test case?')) onClose();
  };
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty]);

  const save = async () => {
    if (!title.trim()) return;

    // Check every step here first (same schema as the API) and show what's missing next to the field.
    const filled = steps.filter((s) => !isBlankStep(s));
    if (!filled.length) {
      toast.error('Add at least one step');
      return;
    }
    const found = steps.map((s) => (isBlankStep(s) ? {} : stepErrors(s)));
    setErrors(found);
    const invalid = found.filter((e) => Object.keys(e).length).length;
    if (invalid) {
      toast.error(`${invalid} step${invalid === 1 ? ' needs' : 's need'} a fix`, {
        description: 'The missing parts are marked in red below each step.',
      });
      return;
    }

    setSaving(true);
    try {
      const casesPath = `/api/projects/${projectId}/test-suites/${suiteId}/test-cases`;
      const body = {
        title: title.trim(),
        // null clears the field on edit; create leaves it out
        description: description.trim() || (editing ? null : undefined),
        expected_result: expected.trim() || (editing ? null : undefined),
        priority,
        type,
        // Fields the action doesn't use are dropped; the API validates the rest (shared schema).
        steps: filled.map((s, idx) => toSavedStep(s, idx + 1)),
      };
      if (editing) await apiClient.put(`${casesPath}/${editing.id}`, body);
      else await apiClient.post(casesPath, body);
      toast.success(editing ? 'Test case saved' : 'Test case created');
      onClose();
      await onSaved();
    } catch (err) {
      // e.g. the step contract's field-level message ("steps.1.value: …")
      toast.error('Could not save the test case', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          if (!saving) void save();
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit test case' : 'Create test case'}</DialogTitle>
          <DialogDescription>
            Write each step the way you would tell a colleague, such as Click &quot;Sign in&quot;. Elements are found by
            the words on the page, so no selectors are needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="case-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="case-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Successful login with valid password"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="case-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger id="case-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="case-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="case-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="functional">Functional</SelectItem>
                  <SelectItem value="smoke">Smoke</SelectItem>
                  <SelectItem value="regression">Regression</SelectItem>
                  <SelectItem value="edge_case">Edge case</SelectItem>
                  <SelectItem value="accessibility">Accessibility</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="case-description">Description</Label>
            <Textarea
              id="case-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is the objective of this test case?"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="case-expected">Expected result</Label>
            <Input
              id="case-expected"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="e.g. User lands on the projects dashboard"
            />
          </div>

          <div className="space-y-2">
            <Label>Steps</Label>
            <p className="text-xs text-muted-foreground">
              Examples: Open /login · Type &quot;ada@example.com&quot; into Email · Click &quot;Sign in&quot; · Check page
              address contains /dashboard · Check &quot;Welcome&quot; is shown. For a login or other saved value, add it
              under Variables and write it as {'{{NAME}}'}, such as Type &quot;{'{{PASSWORD}}'}&quot; into Password.
              Pasting several lines adds a step for each; Enter starts the next step and Ctrl+Enter saves.
            </p>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <StepRow
                  key={idx}
                  index={idx}
                  step={step}
                  // Once a save was attempted, errors follow edits live so a fix clears its message.
                  errors={errors ? (isBlankStep(step) ? {} : stepErrors(step)) : undefined}
                  onChange={(next) => setSteps(steps.map((s, i) => (i === idx ? next : s)))}
                  onRemove={steps.length > 1 ? () => setSteps(steps.filter((_, i) => i !== idx)) : undefined}
                  onMoveUp={idx > 0 ? () => moveStep(idx, idx - 1) : undefined}
                  onMoveDown={idx < steps.length - 1 ? () => moveStep(idx, idx + 1) : undefined}
                  onEnter={() => enterOn(idx)}
                  onPasteLines={(lines) => pasteAt(idx, lines)}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => setSteps([...steps, newDraftStep()])}
            >
              <Plus />
              Add step
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || !title.trim()}>
            {saving && <Spinner className="text-primary-foreground" />}
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
