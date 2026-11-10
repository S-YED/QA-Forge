'use client';

import { CircleHelp, X } from 'lucide-react';
import {
  STEP_ACTIONS,
  STEP_ACTION_FIELDS,
  STEP_TARGET_HELP,
  TestCaseStepSchema,
  describeStep,
  parseStepSentence,
  type StepAction,
} from '@qaforge/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** A step being edited. `action` is '' until the user picks one or writes a sentence the editor understands. */
export interface DraftStep {
  action: StepAction | '';
  instruction: string;
  selector: string;
  value: string;
}

export type StepErrors = Partial<Record<'action' | 'instruction' | 'selector' | 'value', string>>;

export const newDraftStep = (): DraftStep => ({ action: '', instruction: '', selector: '', value: '' });

export const isBlankStep = (s: DraftStep) => !s.action && !s.instruction.trim() && !s.selector.trim() && !s.value;

/** Actions whose element is optional (press a key on the page, scroll the page). */
const OPTIONAL_TARGET: StepAction[] = ['press', 'scroll'];

/** The step as saved: unused fields dropped, an empty description filled from the structured fields. */
export function toSavedStep(s: DraftStep, stepNumber: number) {
  const action = s.action as StepAction;
  const needs = s.action ? STEP_ACTION_FIELDS[action] : null;
  const selector = needs && (needs.selector || OPTIONAL_TARGET.includes(action)) ? s.selector.trim() || undefined : undefined;
  const value = needs?.value ? s.value || undefined : undefined;
  const instruction = s.instruction.trim() || (s.action ? describeStep({ action, selector, value }) : '');
  return { step_number: stepNumber, action, instruction, selector, value };
}

/** Field errors in plain words, from the same schema the API uses. */
export function stepErrors(s: DraftStep): StepErrors {
  if (!s.action) return { action: 'Pick what this step does, or write it as a sentence above' };
  const r = TestCaseStepSchema.safeParse(toSavedStep(s, 1));
  if (r.success) return {};
  const errors: StepErrors = {};
  for (const issue of r.error.issues) {
    const field = issue.path[0] as keyof StepErrors;
    errors[field] ??= field === 'instruction' ? 'Describe the step' : issue.message;
  }
  return errors;
}

const GROUPS: { title: string; group: 'do' | 'check' }[] = [
  { title: 'Do', group: 'do' },
  { title: 'Check', group: 'check' },
];

function Help({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="What is an element?">
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="text-xs text-destructive">{message}</p> : null;

interface StepRowProps {
  index: number;
  step: DraftStep;
  errors?: StepErrors;
  onChange: (step: DraftStep) => void;
  onRemove?: () => void;
}

export function StepRow({ index, step, errors = {}, onChange, onRemove }: StepRowProps) {
  const n = index + 1;
  const info = step.action ? STEP_ACTION_FIELDS[step.action] : null;
  const showTarget = !!info && (info.selector || OPTIONAL_TARGET.includes(step.action as StepAction));

  // Writing the sentence fills the structured fields it can read; they stay editable.
  const onSentence = (instruction: string) => {
    const parsed = parseStepSentence(instruction);
    onChange(
      parsed
        ? { instruction, action: parsed.action, selector: parsed.selector ?? '', value: parsed.value ?? '' }
        : { ...step, instruction },
    );
  };

  const preview =
    step.action && !errors.selector && !errors.value
      ? describeStep({ action: step.action, selector: step.selector.trim() || undefined, value: step.value || undefined })
      : null;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2.5 w-5 shrink-0 select-none font-mono text-xs text-muted-foreground">{n}.</span>
        <div className="flex-1 space-y-1">
          <Input
            value={step.instruction}
            onChange={(e) => onSentence(e.target.value)}
            placeholder={n === 1 ? 'e.g. Open /login' : 'e.g. Click "Sign in"   or   Type "ada@example.com" into Email'}
            aria-label={`Step ${n} description`}
            aria-invalid={!!errors.instruction}
          />
          <FieldError message={errors.instruction} />
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove step ${n}`}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <div className="grid gap-2 pl-7 sm:grid-cols-[11rem_1fr_1fr]">
        <div className="space-y-1">
          <span className="flex h-5 items-center text-xs text-muted-foreground">Action</span>
          <Select value={step.action || undefined} onValueChange={(v) => onChange({ ...step, action: v as StepAction })}>
            <SelectTrigger aria-label={`Step ${n} action`} aria-invalid={!!errors.action}>
              <SelectValue placeholder="What to do" />
            </SelectTrigger>
            <SelectContent>
              {GROUPS.map(({ title, group }) => (
                <SelectGroup key={group}>
                  <SelectLabel>{title}</SelectLabel>
                  {STEP_ACTIONS.filter((a) => STEP_ACTION_FIELDS[a].group === group).map((a) => (
                    <SelectItem key={a} value={a} title={STEP_ACTION_FIELDS[a].description}>
                      {STEP_ACTION_FIELDS[a].label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.action} />
        </div>

        {showTarget && (
          <div className="space-y-1">
            <div className="flex h-5 items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Element{info?.selector ? '' : ' (optional)'}</span>
              <Help text={`${STEP_TARGET_HELP}. Examples: Sign in, Email, [data-testid="login-submit"]`} />
            </div>
            <Input
              value={step.selector}
              onChange={(e) => onChange({ ...step, selector: e.target.value })}
              placeholder="e.g. Sign in"
              aria-label={`Step ${n} element`}
              aria-invalid={!!errors.selector}
            />
            <FieldError message={errors.selector} />
          </div>
        )}

        {info?.value && (
          <div className="space-y-1">
            <span className="flex h-5 items-center text-xs text-muted-foreground">{info.valueLabel ?? 'Value'}</span>
            <Input
              value={step.value}
              onChange={(e) => onChange({ ...step, value: e.target.value })}
              placeholder={info.valueHint}
              aria-label={`Step ${n} value`}
              aria-invalid={!!errors.value}
            />
            <FieldError message={errors.value} />
          </div>
        )}
      </div>

      {info && (
        <p className="pl-7 text-xs text-muted-foreground">
          {info.description}
          {preview && (
            <>
              {' '}Runs as: <span className="font-mono text-foreground">{preview}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
