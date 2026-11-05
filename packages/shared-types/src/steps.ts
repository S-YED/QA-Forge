import { z } from 'zod';

// Canonical test-step contract (TD-1). The runner dispatches only on `action`;
// `instruction` is the human-readable description shown in the UI.

export const STEP_ACTIONS = [
  'navigate',
  'click',
  'fill',
  'select',
  'hover',
  'press',
  'wait_for',
  'assert_visible',
  'assert_text',
  'assert_url',
  'scroll',
] as const;

export const StepActionSchema = z.enum(STEP_ACTIONS);
export type StepAction = z.infer<typeof StepActionSchema>;

/**
 * Which optional fields each action needs. The schema enforces this, the step
 * editor uses it to show inputs, and the AI prompt is built from it.
 */
export const STEP_ACTION_FIELDS: Record<
  StepAction,
  { selector: boolean; value: boolean; valueHint?: string }
> = {
  navigate: { selector: false, value: true, valueHint: 'URL or path, e.g. /login' },
  click: { selector: true, value: false },
  fill: { selector: true, value: true, valueHint: 'text to type' },
  select: { selector: true, value: true, valueHint: 'option value or label' },
  hover: { selector: true, value: false },
  press: { selector: false, value: true, valueHint: 'key, e.g. Enter' },
  wait_for: { selector: true, value: false },
  assert_visible: { selector: true, value: false },
  assert_text: { selector: true, value: true, valueHint: 'text the element must contain' },
  assert_url: { selector: false, value: true, valueHint: 'text the URL must contain' },
  scroll: { selector: false, value: false },
};

/** Blank strings (common from forms and LLMs) count as "not provided". */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().max(max).optional(),
  );

export const TestCaseStepSchema = z
  .object({
    step_number: z.number().int().min(1),
    action: StepActionSchema,
    instruction: z.string().trim().min(1).max(500),
    selector: optionalText(500),
    value: optionalText(2000),
    expected: optionalText(1000),
  })
  .superRefine((step, ctx) => {
    const needs = STEP_ACTION_FIELDS[step.action];
    if (needs.selector && step.selector === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selector'], message: `selector is required for ${step.action}` });
    }
    if (needs.value && step.value === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: `value is required for ${step.action}` });
    }
  });

export type TestCaseStep = z.infer<typeof TestCaseStepSchema>;

export const TestCaseStepsSchema = z.array(TestCaseStepSchema).min(1).max(100);

export const TestCasePrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export const TestCaseTypeSchema = z.enum([
  'functional',
  'regression',
  'smoke',
  'edge_case',
  'accessibility',
  'negative',
]);

/** A test case as produced by AI generation/optimization, before it is saved. */
export const GeneratedTestCaseSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(2000).default(''),
  steps: TestCaseStepsSchema,
  expected_result: z.string().max(2000).default(''),
  priority: TestCasePrioritySchema.catch('medium'),
  type: TestCaseTypeSchema.catch('functional'),
  tags: z.array(z.string().max(50)).max(20).catch([]),
});

export type GeneratedTestCase = z.infer<typeof GeneratedTestCaseSchema>;
