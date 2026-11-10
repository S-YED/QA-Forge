import type { StepAction } from './steps.js';

/** CSS, XPath or a Playwright engine (`role=`, `text=`); anything else is the words a person sees on the page. */
const ENGINE_PREFIX = /^(css|xpath|text|role|id|data-testid|internal:[\w-]+)=/;
const CSS_START = /^(#|\.|\[|\/\/|\(\/\/)/;
/** tag followed by a CSS piece, e.g. `button[type=submit]`, `input#email`, `div > a`, `li:nth-child(2)` */
const TAG_CSS = /^[a-z][a-z0-9-]*([#.[]|:[a-z-]|\s*>)/i;

export function looksLikeSelector(target: string): boolean {
  const t = target.trim();
  return ENGINE_PREFIX.test(t) || CSS_START.test(t) || TAG_CSS.test(t);
}

export interface ExportStep {
  action: StepAction | string;
  instruction?: string | null;
  selector?: string | null;
  value?: string | null;
}

const s = JSON.stringify;
const KIND: Partial<Record<StepAction, 'field' | 'control'>> = {
  fill: 'field', select: 'field', click: 'control', hover: 'control', press: 'control',
};

/** Finder that mirrors the runner (packages/playwright-runner/src/locate.ts), kept small enough to read. */
const FIND_HELPER = `/** Finds an element by the words on it, like QA Forge does: label, placeholder, role and name, text, test id. */
async function find(page: Page, words: string, kind: 'field' | 'control' | 'any'): Promise<Locator> {
  const roles = {
    field: ['textbox', 'combobox', 'searchbox', 'spinbutton', 'listbox'],
    control: ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'option', 'switch'],
    any: ['button', 'link', 'heading', 'alert', 'status', 'dialog', 'img', 'textbox', 'combobox'],
  } as const;
  const byRole = (exact: boolean) => roles[kind].map((r) => page.getByRole(r, { name: words, exact }));
  const tries = (exact: boolean): Locator[] =>
    kind === 'field'
      ? [page.getByLabel(words, { exact }), page.getByPlaceholder(words, { exact }), ...byRole(exact)]
      : kind === 'control'
        ? [...byRole(exact), page.getByLabel(words, { exact }), page.getByText(words, { exact })]
        : [...byRole(exact), page.getByText(words, { exact }), page.getByLabel(words, { exact })];
  const all = [...tries(true), ...tries(false), page.getByTestId(words)].map((l) => l.filter({ visible: true }));
  const deadline = Date.now() + 15_000;
  for (;;) {
    for (const l of all) {
      const n = await l.count();
      if (n === 1 || (n > 1 && kind === 'any')) return l.first();
    }
    if (Date.now() > deadline) throw new Error(\`Couldn't find "\${words}"\`);
    await page.waitForTimeout(150);
  }
}`;

/**
 * A runnable Playwright Test file for a case's steps. Every value is escaped; selectors are used as written and
 * plain-word targets go through the same lookup order the runner uses, so the file behaves like the QA Forge run.
 */
export function stepsToPlaywright(steps: ExportStep[], title: string, baseUrl?: string): string {
  let needsFind = false;
  const el = (step: ExportStep, kind: 'field' | 'control' | 'any') => {
    const target = (step.selector ?? '').trim();
    if (looksLikeSelector(target)) return `page.locator(${s(target)})`;
    needsFind = true;
    return `(await find(page, ${s(target)}, ${s(kind)}))`;
  };

  const body = steps.map((step) => {
    const action = step.action as StepAction;
    const v = s(step.value ?? '');
    const target = () => el(step, KIND[action] ?? 'any');
    const code = (() => {
      switch (action) {
        case 'navigate': return `await page.goto(new URL(${v}, BASE_URL).toString());`;
        case 'click': return `await ${target()}.click();`;
        case 'fill': return `await ${target()}.fill(${v});`;
        case 'select': return `await ${target()}.selectOption(${v});`;
        case 'hover': return `await ${target()}.hover();`;
        case 'press': return step.selector ? `await ${target()}.press(${v});` : `await page.keyboard.press(${v});`;
        case 'wait_for':
        case 'assert_visible': return `await expect(${target()}.first()).toBeVisible();`;
        case 'assert_text': return `await expect(${target()}.first()).toContainText(${v});`;
        case 'assert_url': return `await expect.poll(() => page.url()).toContain(${v});`;
        case 'scroll': return step.selector ? `await ${target()}.first().scrollIntoViewIfNeeded();` : 'await page.mouse.wheel(0, 600);';
        default: return `// Unsupported step ${s(step.action)} was skipped`;
      }
    })();
    const comment = step.instruction ? `  // ${step.instruction.replace(/\s+/g, ' ').trim()}\n` : '';
    return `${comment}  ${code}`;
  });

  return [
    `import { test, expect${needsFind ? ', type Locator, type Page' : ''} } from '@playwright/test';`,
    '',
    `// Exported from QA Forge. Run with: npx playwright test`,
    `const BASE_URL = ${s(baseUrl || 'http://localhost:3000/')};`,
    ...(needsFind ? ['', FIND_HELPER] : []),
    '',
    `test(${s(title)}, async ({ page }) => {`,
    ...body,
    '});',
    '',
  ].join('\n');
}
