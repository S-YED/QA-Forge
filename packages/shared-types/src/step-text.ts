import type { StepAction } from './steps.js';

/** The structured part of a step that a sentence can describe. */
export interface StepParts {
  action: StepAction;
  selector?: string;
  value?: string;
}

const QUOTED = /^(["'])(.*)\1$|^“(.*)”$|^‘(.*)’$/;
const NOUN_SUFFIX = /\s+(button|link|field|input|box|textbox|text box|dropdown|menu|tab|checkbox|option|heading|message|text)$/i;

/** Turn the words naming an element into a target: drop quotes, "the", "button with name", trailing nouns. */
function target(raw: string): string {
  let t = raw.trim().replace(/^(for|on|at|in|into)\s+/i, '');
  const named = /(?:named|called|labell?ed|titled|with (?:the )?(?:name|text|label|title|placeholder))\s+(.+)$/i.exec(t);
  if (named) t = named[1].trim();
  const unquoted = (s: string) => {
    const q = QUOTED.exec(s);
    return q ? (q[2] ?? q[3] ?? q[4] ?? '').trim() : null;
  };
  const stripped = t.replace(/^(the|a|an)\s+/i, '').replace(NOUN_SUFFIX, '').trim();
  return unquoted(t) ?? unquoted(stripped) ?? stripped; // `"Sign in"` and `the "Sign in" button` both give Sign in
}

/** A typed value: quotes are removed, everything else is kept as written. */
function text(raw: string): string {
  const t = raw.trim();
  const q = QUOTED.exec(t);
  return q ? (q[2] ?? q[3] ?? q[4] ?? '') : t;
}

const CHECK = '(?:check|verify|assert|expect|ensure|confirm|make sure)\\s+(?:that\\s+)?';
const SHOWN = '(?:\\s+(?:is|are)\\s+(?:shown|visible|displayed|present|there|on (?:the )?(?:page|screen)))?';
const isPath = (v: string) => /^(\/|https?:\/\/|[\w-]+(\.[\w-]+)+(\/|$))/i.test(v);

type Rule = [RegExp, (m: RegExpExecArray) => StepParts];
const RULES: Rule[] = [
  [/^(?:open|go to|navigate to|visit|load)\s+(?:the\s+)?(.+)$/i, (m) => {
    const v = text(m[1]);
    return isPath(v) ? { action: 'navigate', value: v } : { action: 'navigate' };
  }],
  [new RegExp(`^${CHECK}(?:the\\s+)?(?:page\\s+)?(?:address|url|path)\\s+(?:contains|includes|has|is|ends with)\\s+(.+)$`, 'i'),
    (m) => ({ action: 'assert_url', value: text(m[1]) })],
  [new RegExp(`^${CHECK}(?:i am|i'm|we are|the user is|user is)\\s+on\\s+(.+)$`, 'i'), (m) => ({ action: 'assert_url', value: text(m[1]) })],
  [/^(?:type|enter|input|write|fill in|fill)\s+(.+?)\s+(?:into|in to|in)\s+(.+)$/i, (m) => ({ action: 'fill', value: text(m[1]), selector: target(m[2]) })],
  [/^(?:fill in|fill|set)\s+(.+?)\s+(?:with|to)\s+(.+)$/i, (m) => ({ action: 'fill', selector: target(m[1]), value: text(m[2]) })],
  [/^(?:choose|select|pick)\s+(.+?)\s+(?:from|in)\s+(.+)$/i, (m) => ({ action: 'select', value: text(m[1]), selector: target(m[2]) })],
  [/^(?:hover over|hover on|hover|mouse over)\s+(.+)$/i, (m) => ({ action: 'hover', selector: target(m[1]) })],
  [/^press\s+(.+\s+button)$/i, (m) => ({ action: 'click', selector: target(m[1]) })],
  [/^press\s+(?:the\s+)?(.+?)(?:\s+key)?(?:\s+(?:in|on)\s+(.+))?$/i, (m) => ({
    action: 'press', value: text(m[1]), ...(m[2] ? { selector: target(m[2]) } : {}),
  })],
  [/^(?:click|tap|hit|select)\s+(?:on\s+)?(.+)$/i, (m) => ({ action: 'click', selector: target(m[1]) })],
  [/^scroll(?:\s+down|\s+up)?(?:\s+the page)?$/i, () => ({ action: 'scroll' })],
  [/^scroll\s+(?:down\s+|up\s+)?to\s+(.+)$/i, (m) => ({ action: 'scroll', selector: target(m[1]) })],
  [new RegExp(`^wait\\s+(?:until|for|till)\\s+(.+?)${SHOWN}(?:\\s+to\\s+(?:appear|show|load))?$`, 'i'),
    (m) => ({ action: 'wait_for', selector: target(m[1]) })],
  [new RegExp(`^${CHECK}(.+?)\\s+(?:contains|has text|has the text|shows|says|reads|includes)\\s+(.+)$`, 'i'),
    (m) => ({ action: 'assert_text', selector: target(m[1]), value: text(m[2]) })],
  [new RegExp(`^(?:${CHECK}|see\\s+)(.+?)${SHOWN}$`, 'i'), (m) => ({ action: 'assert_visible', selector: target(m[1]) })],
];

/**
 * Read a step written as a sentence, e.g. `Click "Sign in"`, `Type "ada@x.com" into Email`,
 * `Check page address contains /dashboard`. Returns null when no rule matches; fields it can't fill are left out.
 * Deterministic on purpose: no AI key needed, and the same words always give the same step.
 */
export function parseStepSentence(sentence: string): StepParts | null {
  const s = sentence.trim().replace(/[.!]+$/, '').trim();
  if (!s) return null;
  for (const [re, build] of RULES) {
    const m = re.exec(s);
    if (m) {
      const parts = build(m);
      // An empty target or value is "not filled", not a match on nothing.
      if (parts.selector === '') delete parts.selector;
      if (parts.value === '') delete parts.value;
      return parts;
    }
  }
  return null;
}

const q = (v: string | undefined) => (v === undefined || v === '' ? '…' : v.includes('"') ? `'${v}'` : `"${v}"`);

/** The sentence for a structured step; `parseStepSentence(describeStep(s))` gives the same step back. */
export function describeStep({ action, selector, value }: StepParts): string {
  switch (action) {
    case 'navigate': return `Open ${value || '…'}`;
    case 'click': return `Click ${q(selector)}`;
    case 'fill': return `Type ${q(value)} into ${q(selector)}`;
    case 'select': return `Choose ${q(value)} in ${q(selector)}`;
    case 'hover': return `Hover over ${q(selector)}`;
    case 'press': return selector ? `Press ${value || '…'} in ${q(selector)}` : `Press ${value || '…'}`;
    case 'wait_for': return `Wait until ${q(selector)} is shown`;
    case 'assert_visible': return `Check ${q(selector)} is shown`;
    case 'assert_text': return `Check ${q(selector)} contains ${q(value)}`;
    case 'assert_url': return `Check page address contains ${value || '…'}`;
    case 'scroll': return selector ? `Scroll to ${q(selector)}` : 'Scroll down';
  }
}
