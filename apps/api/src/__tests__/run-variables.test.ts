import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/supabase.js', () => ({ supabase: {} }));

const { MASK, maskSecrets, resolveSteps, usesVariables } = await import('../services/run-variables.js');

const vars = [
  { name: 'EMAIL', value: 'ada@example.com', is_secret: false },
  { name: 'PASSWORD', value: 'hunter2', is_secret: true },
  { name: 'PASSWORD_LONG', value: 'hunter2-and-more', is_secret: true },
];

describe('project variables in steps (F4)', () => {
  it('fills {{NAME}} in the value and the element, and leaves everything else as written', () => {
    const steps = [
      { step_number: 1, action: 'fill', instruction: 'Type "{{EMAIL}}" into Email', selector: 'Email', value: '{{EMAIL}}' },
      { step_number: 2, action: 'fill', instruction: 'Type the password', selector: 'Password', value: '{{ PASSWORD }}' },
      { step_number: 3, action: 'assert_visible', instruction: 'Greeting', selector: 'Welcome back, {{EMAIL}}' },
      { step_number: 4, action: 'fill', instruction: 'Literal braces', selector: 'Notes', value: '{{not a variable}} {{lower}}' },
    ];
    const { steps: out, missing } = resolveSteps(steps, vars);
    expect(missing).toEqual([]);
    expect(out.map((s) => [s.selector, s.value])).toEqual([
      ['Email', 'ada@example.com'],
      ['Password', 'hunter2'],
      ['Welcome back, ada@example.com', undefined],
      ['Notes', '{{not a variable}} {{lower}}'],
    ]);
    expect(out[0].instruction).toBe('Type "{{EMAIL}}" into Email'); // the description keeps the name, never the value
    expect(steps[1].value).toBe('{{ PASSWORD }}'); // the saved steps are not changed
  });

  it('names every variable that is not set, once each', () => {
    const { missing } = resolveSteps(
      [
        { selector: 'A', value: '{{TOKEN}}' },
        { selector: '{{TOKEN}} {{REGION}}', value: '{{EMAIL}}' },
      ],
      vars,
    );
    expect(missing).toEqual(['TOKEN', 'REGION']);
  });

  it('knows when steps use no variables at all', () => {
    expect(usesVariables([{ selector: 'Email', value: 'ada@example.com' }, { value: null }, null])).toBe(false);
    expect(usesVariables([{ selector: 'Email' }, { value: 'x {{PASSWORD}}' }])).toBe(true);
    expect(usesVariables([{ selector: 'Hello {{EMAIL}}' }])).toBe(true);
  });

  it('masks every secret value, the longer one whole, and leaves non-secret values readable', () => {
    const { secrets } = resolveSteps([], vars);
    expect(secrets).toEqual(['hunter2-and-more', 'hunter2']);
    expect(maskSecrets('Expected "hunter2-and-more" but ada@example.com typed hunter2, then hunter2 again', secrets)).toBe(
      `Expected "${MASK}" but ada@example.com typed ${MASK}, then ${MASK} again`,
    );
    expect(maskSecrets(null, secrets)).toBeNull();
    expect(maskSecrets('nothing secret here', [])).toBe('nothing secret here');
  });
});
