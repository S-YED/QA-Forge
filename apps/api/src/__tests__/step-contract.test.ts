import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiKeyProvider,
  STEP_ACTIONS,
  STEP_ACTION_FIELDS,
  TestCaseStepSchema,
  TestCaseStepsSchema,
} from '@qaforge/shared-types';
import { generateTestCases, validateGeneratedCase } from '@qaforge/ai-engine';

const step = (over: Record<string, unknown>) => ({ step_number: 1, instruction: 'do it', ...over });

/** Minimal valid step for an action, built from the requirement table. */
const validFor = (action: (typeof STEP_ACTIONS)[number]) =>
  step({
    action,
    ...(STEP_ACTION_FIELDS[action].selector && { selector: '[data-testid="x"]' }),
    ...(STEP_ACTION_FIELDS[action].value && { value: 'v' }),
  });

const issuePaths = (input: unknown) => {
  const r = TestCaseStepSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('TestCaseStepSchema', () => {
  it.each(STEP_ACTIONS)('accepts a minimal valid %s step', (action) => {
    expect(TestCaseStepSchema.safeParse(validFor(action)).success).toBe(true);
  });

  it('rejects a step with no action (legacy free-text step)', () => {
    expect(issuePaths(step({}))).toContain('action');
  });

  it('rejects an unknown action instead of falling back to click', () => {
    expect(issuePaths(step({ action: 'double_click', selector: '#a' }))).toContain('action');
  });

  it.each(STEP_ACTIONS.filter((a) => STEP_ACTION_FIELDS[a].selector))('requires selector for %s', (action) => {
    expect(issuePaths({ ...validFor(action), selector: undefined })).toContain('selector');
  });

  it.each(STEP_ACTIONS.filter((a) => STEP_ACTION_FIELDS[a].value))('requires value for %s', (action) => {
    expect(issuePaths({ ...validFor(action), value: undefined })).toContain('value');
  });

  it('treats blank strings as missing', () => {
    expect(issuePaths(step({ action: 'fill', selector: '  ', value: '' }))).toEqual(['selector', 'value']);
  });

  it('rejects an empty step list', () => {
    expect(TestCaseStepsSchema.safeParse([]).success).toBe(false);
  });
});

describe('validateGeneratedCase', () => {
  const base = { title: 'Login', description: 'd', expected_result: 'e', priority: 'high', type: 'smoke', tags: [] };

  it('renumbers steps and accepts a valid case', () => {
    const r = validateGeneratedCase({
      ...base,
      steps: [
        { step_number: 7, action: 'navigate', instruction: 'open', value: '/login' },
        { step_number: 7, action: 'click', instruction: 'submit', selector: '#go' },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.testCase.steps.map((s) => s.step_number)).toEqual([1, 2]);
  });

  it('rejects a case whose step has no action, with a field path', () => {
    const r = validateGeneratedCase({ ...base, steps: [{ instruction: 'click login' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.startsWith('steps.0.action'))).toBe(true);
  });

  it('defaults bad priority/type instead of rejecting', () => {
    const r = validateGeneratedCase({
      ...base,
      priority: 'urgent',
      type: 'vibes',
      steps: [{ action: 'assert_url', instruction: 'on dashboard', value: '/dashboard' }],
    });
    expect(r.ok && r.testCase.priority === 'medium' && r.testCase.type === 'functional').toBe(true);
  });
});

describe('generateTestCases (mocked provider)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps contract-valid cases, reports rejected ones, and tells the model the action enum', async () => {
    const modelOutput = [
      { title: 'Good', steps: [{ action: 'click', instruction: 'Sign in', selector: '#go' }] },
      { title: 'Bad', steps: [{ instruction: 'Click sign in' }] },
    ];
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await generateTestCases({ prompt: 'login', provider: ApiKeyProvider.OPENAI, apiKey: 'k' });

    expect(res.test_cases.map((t) => t.title)).toEqual(['Good']);
    expect(res.rejected).toEqual([{ title: 'Bad', errors: expect.arrayContaining([expect.stringMatching(/^steps\.0\.action/)]) }]);
    const sentBody = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sentBody.messages[0].content).toContain('assert_visible');
  });

  it('throws when no case matches the contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '[{"title":"x","steps":[]}]' } }] })),
    ));
    await expect(generateTestCases({ prompt: 'p', provider: ApiKeyProvider.OPENAI, apiKey: 'k' })).rejects.toThrow(/step contract/);
  });
});
