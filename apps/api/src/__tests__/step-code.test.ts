import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { STEP_ACTIONS, STEP_ACTION_FIELDS, looksLikeSelector, stepsToPlaywright } from '@qaforge/shared-types';

/** The exported file must at least be valid TypeScript that compiles to valid JavaScript. */
function compiles(code: string) {
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  expect(js.diagnostics ?? []).toEqual([]);
  new vm.Script(js.outputText); // throws on a syntax error
}

const NASTY = `it's "quoted" \\ back\`tick\` \${x}\nnew line`;

describe('stepsToPlaywright (Export script)', () => {
  it('turns every action into code, with plain-word and CSS targets and hostile values', () => {
    const steps = STEP_ACTIONS.flatMap((action) =>
      ['Sign in', '[data-testid="x"]'].map((selector) => ({
        action,
        instruction: `${STEP_ACTION_FIELDS[action].label} ${NASTY}`,
        selector: STEP_ACTION_FIELDS[action].selector ? selector : undefined,
        value: STEP_ACTION_FIELDS[action].value ? NASTY : undefined,
      })),
    );
    const code = stepsToPlaywright(steps, `Title ${NASTY}`, 'https://shop.example.com/app/');
    compiles(code);
    expect(code).not.toContain('Unsupported');
    expect(code).toContain('await page.goto(new URL(');
    expect(code).toContain('find(page, "Sign in", "control")');
    expect(code).toContain('page.locator("[data-testid=\\"x\\"]")');
    expect(code).toContain('import { test, expect, type Locator, type Page }');
  });

  it('resolves navigation against the base URL, keeping absolute URLs as they are', () => {
    const code = stepsToPlaywright([{ action: 'navigate', value: 'https://other.example.com/x' }], 't', 'https://shop.example.com/');
    expect(code).toContain('new URL("https://other.example.com/x", BASE_URL)');
    expect(code).toContain('const BASE_URL = "https://shop.example.com/"');
    expect(code).not.toContain('find('); // no helper when nothing needs it
    compiles(code);
  });

  it('agrees with the runner on what a selector is', () => {
    expect(looksLikeSelector('#go')).toBe(true);
    expect(looksLikeSelector('Sign in')).toBe(false);
  });
});
