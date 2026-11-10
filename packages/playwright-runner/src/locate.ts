import type { Locator, Page } from 'playwright';
import { looksLikeSelector, unquote, type StepAction } from '@qaforge/shared-types';

/**
 * A step's target is either a selector (CSS, XPath or a Playwright engine such as `role=` / `text=`) or the
 * words a person sees: a button's text, a field's label or placeholder, a heading, a test id.
 * Plain words are resolved here, deterministically, with Playwright's user-facing locators. The exported script
 * (shared-types `stepsToPlaywright`) mirrors this order; keep them in step.
 */
export { looksLikeSelector, unquote };

type Candidate = (page: Page, text: string, exact: boolean) => Locator;
type Role = Parameters<Page['getByRole']>[0];

const FIELD_ROLES: Role[] = ['textbox', 'combobox', 'searchbox', 'spinbutton', 'listbox'];
const CLICKABLE_ROLES: Role[] = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'option', 'switch'];
const NAMED_ROLES: Role[] = [...CLICKABLE_ROLES, 'heading', 'img', 'alert', 'status', 'dialog', ...FIELD_ROLES];

const byLabel: Candidate = (p, t, exact) => p.getByLabel(t, { exact });
const byPlaceholder: Candidate = (p, t, exact) => p.getByPlaceholder(t, { exact });
const byText: Candidate = (p, t, exact) => p.getByText(t, { exact });
/** One candidate per role, in order: a "Log in" button wins over a "Log in" link, as a person reading a form expects. */
const eachRole = (roles: Role[]): Candidate[] => roles.map((role) => (p, t, exact) => p.getByRole(role, { name: t, exact }));
const anyRole =
  (roles: Role[]): Candidate =>
  (p, t, exact) =>
    roles.map((role) => p.getByRole(role, { name: t, exact })).reduce((a, b) => a.or(b));

/** Checks and waits only need something matching to be visible; actions need exactly one element. */
const CHECKS: StepAction[] = ['wait_for', 'assert_visible', 'assert_text', 'scroll'];

/** Where to look, in order, for each kind of action. */
function candidatesFor(action: StepAction): { kinds: Candidate[]; noun: string } {
  switch (action) {
    case 'fill':
    case 'select':
      return { kinds: [byLabel, byPlaceholder, ...eachRole(FIELD_ROLES)], noun: 'a field labelled' };
    case 'click':
    case 'hover':
      return { kinds: [...eachRole(CLICKABLE_ROLES), byLabel, byText], noun: 'a button, link or control called' };
    case 'press': // usually a key in a field (Enter in Search), sometimes on a control
      return {
        kinds: [byLabel, byPlaceholder, ...eachRole(FIELD_ROLES), ...eachRole(CLICKABLE_ROLES), byText],
        noun: 'a field or control called',
      };
    default:
      return { kinds: [anyRole(NAMED_ROLES), byText, byLabel, byPlaceholder], noun: 'anything showing' };
  }
}

/**
 * Find the single visible element a step targets. Selectors are used as written; plain words are tried exact first,
 * then as a case-insensitive part, and finally as a test id. Polls until exactly one visible element matches or the
 * timeout passes; ambiguity that persists fails early with a clear message.
 * ponytail: ambiguity gives up after 2 s; raise it if pages that settle slowly report false ambiguity.
 */
export async function locateTarget(page: Page, target: string, action: StepAction, timeoutMs: number): Promise<Locator> {
  if (looksLikeSelector(target)) return page.locator(target);

  const text = unquote(target);
  const { kinds, noun } = candidatesFor(action);
  const tries: Locator[] = [
    ...kinds.map((k) => k(page, text, true)),
    ...kinds.map((k) => k(page, text, false)),
    // A single word may also be a test id or a bare tag name (`h1`, `form`), tried last.
    ...(/^[\w-]+$/.test(text) ? [page.getByTestId(text)] : []),
    ...(/^[a-z][a-z0-9-]*$/i.test(text) ? [page.locator(text)] : []),
  ].map((l) => l.filter({ visible: true }));

  const anyMatchWill = CHECKS.includes(action);
  const deadline = Date.now() + timeoutMs;
  let ambiguousSince = 0;
  for (;;) {
    let ambiguousCount = 0;
    for (const loc of tries) {
      const n = await loc.count();
      if (n === 1) return loc;
      if (n > 1 && anyMatchWill) return loc.first();
      if (n > 1) {
        ambiguousCount = n; // several match the best guess: never fall back to a weaker candidate that matches one
        break;
      }
    }
    const now = Date.now();
    ambiguousSince = ambiguousCount ? ambiguousSince || now : 0;
    const where = new URL(page.url()).pathname;
    if (ambiguousSince && now - ambiguousSince > 2_000) {
      throw new Error(`${ambiguousCount} elements match "${text}" on ${where}; add more words or use a selector`);
    }
    if (now > deadline) throw new Error(`Couldn't find ${noun} "${text}" on ${where}`);
    await page.waitForTimeout(150);
  }
}
