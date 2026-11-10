import { describe, expect, it } from 'vitest';
import { STEP_ACTIONS, STEP_ACTION_FIELDS, TestCaseStepSchema, describeStep, parseStepSentence } from '@qaforge/shared-types';

describe('parseStepSentence', () => {
  it.each([
    ['Open /login', { action: 'navigate', value: '/login' }],
    ['Go to https://shop.example.com/cart', { action: 'navigate', value: 'https://shop.example.com/cart' }],
    ['Click "Sign in"', { action: 'click', selector: 'Sign in' }],
    ['Click on the Sign in button', { action: 'click', selector: 'Sign in' }],
    ['Press the Sign in button', { action: 'click', selector: 'Sign in' }],
    ['Type "ada@example.com" into "Email"', { action: 'fill', value: 'ada@example.com', selector: 'Email' }],
    ['Enter s3cret in the Password field', { action: 'fill', value: 's3cret', selector: 'Password' }],
    ['Fill Email with ada@example.com', { action: 'fill', selector: 'Email', value: 'ada@example.com' }],
    ['Choose "India" in "Country"', { action: 'select', value: 'India', selector: 'Country' }],
    ['Select USA from the Country dropdown', { action: 'select', value: 'USA', selector: 'Country' }],
    ['Hover over Account', { action: 'hover', selector: 'Account' }],
    ['Press Enter', { action: 'press', value: 'Enter' }],
    ['Press Enter in Search', { action: 'press', value: 'Enter', selector: 'Search' }],
    ['Scroll down', { action: 'scroll' }],
    ['Scroll to "Footer"', { action: 'scroll', selector: 'Footer' }],
    ['Wait until "Order placed" is shown', { action: 'wait_for', selector: 'Order placed' }],
    ['Check "Welcome back" is shown', { action: 'assert_visible', selector: 'Welcome back' }],
    ['Check "Total" contains "$108.00"', { action: 'assert_text', selector: 'Total', value: '$108.00' }],
    ['Check page address contains /dashboard', { action: 'assert_url', value: '/dashboard' }],
    ['Verify the URL contains /dashboard.', { action: 'assert_url', value: '/dashboard' }],
    // Phrasings from a real first attempt (10 Nov smoke test)
    ['Check for Button with Name "Sign in"', { action: 'assert_visible', selector: 'Sign in' }],
    ['Click on the "Sign in" Button', { action: 'click', selector: 'Sign in' }],
  ])('%s', (sentence, expected) => {
    expect(parseStepSentence(sentence)).toEqual(expected);
  });

  it('leaves out what it cannot read, and returns null for anything else', () => {
    expect(parseStepSentence('Open the login page')).toEqual({ action: 'navigate' }); // not a path: ask, don't guess
    expect(parseStepSentence('Make a cup of tea')).toBeNull();
    expect(parseStepSentence('   ')).toBeNull();
  });
});

describe('describeStep', () => {
  it('reads back to the same step for every action', () => {
    for (const action of STEP_ACTIONS) {
      const f = STEP_ACTION_FIELDS[action];
      const parts = {
        action,
        ...(f.selector && { selector: 'Sign in' }),
        ...(f.value && { value: action === 'navigate' || action === 'assert_url' ? '/login' : 'Enter' }),
      };
      expect(parseStepSentence(describeStep(parts)), describeStep(parts)).toEqual(parts);
    }
  });

  it('every action has a plain-language label and an example the parser understands', () => {
    for (const action of STEP_ACTIONS) {
      const f = STEP_ACTION_FIELDS[action];
      expect(f.label.length).toBeGreaterThan(2);
      expect(f.description.length).toBeGreaterThan(10);
      expect(parseStepSentence(f.example)?.action, f.example).toBe(action);
    }
  });

  it('explains a missing element in plain words', () => {
    const r = TestCaseStepSchema.safeParse({ step_number: 1, action: 'click', instruction: 'Click it' });
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0].message).toBe('"Click" needs an element: the text you see on it, its label, or a selector');
  });
});
