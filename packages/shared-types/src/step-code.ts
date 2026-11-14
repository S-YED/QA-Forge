import type { StepAction } from './steps.js';

/** CSS, XPath or a Playwright engine (`role=`, `text=`); anything else is the words a person sees on the page. */
const ENGINE_PREFIX = /^(css|xpath|text|role|id|data-testid|internal:[\w-]+)=/;
const XPATH = /^\(?\/\//;
/** `#email`, `.btn`, `[name=q]`; not words that happen to start that way (`#1 Deals`, `[Beta] Sign in`). */
const CSS_START = /^([#.][a-z_-]|\[[a-z_-][\w-]*\s*[~|^$*]?=)/i;
// ponytail: known tags only, so words like "Search..." or "e.g. name" stay words; add a tag if a real selector is missed.
const TAG =
  '(?:a|article|aside|body|button|dialog|div|fieldset|footer|form|h[1-6]|header|html|iframe|img|input|label|legend|li|main|nav|ol|option|p|section|select|span|svg|table|tbody|td|textarea|th|thead|tr|ul)';
const PART = String.raw`(?:[#.][\w-]+|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?)`;
const COMPOUND = `(?:${TAG}${PART}*|${PART}+)`;
/** tag followed by a CSS piece: `button[type=submit]`, `input#email`, `li:nth-child(2)` */
const TAG_START = new RegExp(String.raw`^${TAG}(?:[#.][a-zA-Z_-]|\[|::?[a-z-])`);
/** a whole selector of tags and pieces: `form button`, `div > a`, `table tr:nth-child(2)` */
const CSS_WHOLE = new RegExp(String.raw`^${COMPOUND}(?:(?:\s*[>+~]\s*|\s+)${COMPOUND})*$`);

export function looksLikeSelector(target: string): boolean {
  const t = target.trim();
  if (/^[a-z][a-z0-9]*$/.test(t)) return false; // a bare `h1` or `button` is tried as words first, then as a tag
  return ENGINE_PREFIX.test(t) || XPATH.test(t) || CSS_START.test(t) || TAG_START.test(t) || CSS_WHOLE.test(t);
}

/** Strip one pair of surrounding quotes, so `"Sign in"` and `Sign in` mean the same. */
export function unquote(target: string): string {
  const t = target.trim();
  return /^(["']).+\1$/.test(t) || /^“.+”$/.test(t) ? t.slice(1, -1).trim() : t;
}

export interface ExportStep {
  action: StepAction | string;
  instruction?: string | null;
  selector?: string | null;
  value?: string | null;
}

const s = JSON.stringify;
type Kind = 'field' | 'control' | 'press' | 'any';
const KIND: Partial<Record<StepAction, Kind>> = {
  fill: 'field', select: 'field', click: 'control', hover: 'control', press: 'press',
};

/** Run results saved before steps had an action enum (migration 23) still say `assert` / `wait`. */
function legacy(step: ExportStep): ExportStep {
  if (step.action === 'assert') {
    const visible = !step.value || step.value.toLowerCase() === 'visible';
    return { ...step, action: visible ? 'assert_visible' : 'assert_text' };
  }
  if (step.action === 'wait' && step.selector) return { ...step, action: 'wait_for' };
  return step;
}

/** Finder that mirrors the runner (packages/playwright-runner/src/locate.ts), kept small enough to read. */
const FIND_HELPER = `/** Finds an element by the words on it, like QA Forge does: label, placeholder, role and name, text, test id. */
async function find(page: Page, words: string, kind: 'field' | 'control' | 'press' | 'any'): Promise<Locator> {
  const roles = {
    field: ['textbox', 'combobox', 'searchbox', 'spinbutton', 'listbox'],
    control: ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'option', 'switch'],
    any: ['button', 'link', 'heading', 'alert', 'status', 'dialog', 'img', 'textbox', 'combobox'],
  } as const;
  const byRole = (k: keyof typeof roles, exact: boolean) => roles[k].map((r) => page.getByRole(r, { name: words, exact }));
  const field = (exact: boolean) => [page.getByLabel(words, { exact }), page.getByPlaceholder(words, { exact }), ...byRole('field', exact)];
  const control = (exact: boolean) => [...byRole('control', exact), page.getByLabel(words, { exact }), page.getByText(words, { exact })];
  const tries = (exact: boolean): Locator[] =>
    kind === 'field' ? field(exact)
      : kind === 'control' ? control(exact)
        : kind === 'press' ? [...field(exact), ...control(exact)]
          : [...byRole('any', exact), page.getByText(words, { exact }), page.getByLabel(words, { exact })];
  const all = [
    ...tries(true),
    ...tries(false),
    page.getByTestId(words),
    ...(/^[a-z][a-z0-9-]*$/i.test(words) ? [page.locator(words)] : []), // a bare tag name such as h1
  ].map((l) => l.filter({ visible: true }));
  const deadline = Date.now() + 15_000;
  for (;;) {
    for (const l of all) {
      const n = await l.count();
      if (n === 1 || (n > 1 && kind === 'any')) return l.first();
      if (n > 1) break; // several match the best guess: never fall back to a weaker one
    }
    if (Date.now() > deadline) throw new Error(\`Couldn't find exactly one "\${words}"\`);
    await page.waitForTimeout(150);
  }
}`;

/**
 * A runnable Playwright Test file for a case's steps. Every value is escaped; selectors are used as written and
 * plain-word targets go through the same lookup order the runner uses, so the file behaves like the QA Forge run.
 */
export function stepsToPlaywright(steps: ExportStep[], title: string, baseUrl?: string): string {
  let needsFind = false;
  const el = (step: ExportStep, kind: Kind) => {
    const target = (step.selector ?? '').trim();
    if (looksLikeSelector(target)) return `page.locator(${s(target)})`;
    needsFind = true;
    return `(await find(page, ${s(unquote(target))}, ${s(kind)}))`;
  };

  const body = steps.map(legacy).map((step) => {
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
        case 'wait' as StepAction: return `await page.waitForTimeout(${Number(step.value) || 1000});`;
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
