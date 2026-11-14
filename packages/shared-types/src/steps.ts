import { z } from 'zod';

// Canonical test-step contract (TD-1). The runner dispatches only on `action`;
// `instruction` is the human-readable description shown in the UI. `selector` holds the step's target: plain words
// seen on the page (resolved by the runner like a person would) or a CSS/XPath/Playwright selector.

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

export interface StepActionInfo {
  /** needs a target ("selector" field): words seen on the page (button text, label, placeholder) or a CSS selector */
  selector: boolean;
  value: boolean;
  valueHint?: string;
  /** Plain-language name shown in the editor and the run view */
  label: string;
  group: 'do' | 'check';
  /** One sentence for tooltips: what the step does */
  description: string;
  /** A sentence the step editor understands, e.g. `Click "Sign in"` */
  example: string;
  /** Label of the value field */
  valueLabel?: string;
}

/**
 * Which optional fields each action needs, plus the words people see for it. The schema enforces the fields,
 * the step editor shows inputs and help from it, and the AI prompt is built from it.
 */
export const STEP_ACTION_FIELDS: Record<StepAction, StepActionInfo> = {
  navigate: {
    selector: false, value: true, valueHint: 'URL or path, e.g. /login', valueLabel: 'Page (path or full URL)',
    label: 'Open page', group: 'do', example: 'Open /login',
    description: "Go to a page. A path like /login opens it on the project's base URL.",
  },
  click: {
    selector: true, value: false,
    label: 'Click', group: 'do', example: 'Click "Sign in"',
    description: 'Click a button, link or anything clickable, found by the text on it.',
  },
  fill: {
    selector: true, value: true, valueHint: 'text to type', valueLabel: 'Text to type',
    label: 'Type into', group: 'do', example: 'Type "ada@example.com" into "Email"',
    description: 'Clear a field and type text into it. Find the field by its label or placeholder.',
  },
  select: {
    selector: true, value: true, valueHint: 'option value or label', valueLabel: 'Option',
    label: 'Choose option', group: 'do', example: 'Choose "India" in "Country"',
    description: 'Pick an option from a dropdown, found by its label.',
  },
  hover: {
    selector: true, value: false,
    label: 'Hover over', group: 'do', example: 'Hover over "Account"',
    description: 'Move the mouse over an element, for example to open a menu.',
  },
  press: {
    selector: false, value: true, valueHint: 'key, e.g. Enter', valueLabel: 'Key (Enter, Tab, Escape…)',
    label: 'Press key', group: 'do', example: 'Press Enter',
    description: 'Press a keyboard key, optionally while a field is focused.',
  },
  wait_for: {
    selector: true, value: false,
    label: 'Wait until shown', group: 'do', example: 'Wait until "Order placed" is shown',
    description: 'Wait for something to appear before going on.',
  },
  assert_visible: {
    selector: true, value: false,
    label: 'Check it is shown', group: 'check', example: 'Check "Welcome back" is shown',
    description: 'Passes only if this text or element is visible on the page.',
  },
  assert_text: {
    selector: true, value: true, valueHint: 'text the element must contain', valueLabel: 'Expected text',
    label: 'Check text', group: 'check', example: 'Check "Total" contains "$108.00"',
    description: 'Passes only if the element contains the expected text.',
  },
  assert_url: {
    selector: false, value: true, valueHint: 'text the URL must contain', valueLabel: 'Address contains',
    label: 'Check page address', group: 'check', example: 'Check page address contains /dashboard',
    description: "Passes only if the page's address (URL) contains this text.",
  },
  scroll: {
    selector: false, value: false,
    label: 'Scroll', group: 'do', example: 'Scroll to "Footer"',
    description: 'Scroll down the page, or to an element if you name one.',
  },
};

/** What a step's target field means, for labels and help text. */
export const STEP_TARGET_HELP =
  'Words you see on the page (button text, a field label or placeholder), or a CSS selector';

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
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selector'],
        message: `"${needs.label}" needs an element: the text you see on it, its label, or a selector`,
      });
    }
    if (needs.value && step.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: `"${needs.label}" needs ${(needs.valueLabel ?? 'a value').toLowerCase()}`,
      });
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
