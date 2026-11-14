// Local demo provider: fixed, hand-written test cases for apps/demo-app, so generation works
// with no AI key (AI_LOCAL_DEMO=true). This is not AI and must be labelled that way in the UI.
import { GeneratedTestCaseSchema, type GeneratedTestCase, type TestCaseStep } from '@qaforge/shared-types';

export const LOCAL_DEMO_PROVIDER = 'local-demo';
export const LOCAL_DEMO_LABEL = 'Local demo, not AI';

type Area = 'login' | 'register' | 'items' | 'checkout' | 'navigation';

/** Words in the prompt that select an area. No match selects every case. */
const AREA_KEYWORDS: Record<Area, string[]> = {
  login: ['login', 'log in', 'sign in', 'signin', 'auth', 'password', 'dashboard'],
  register: ['register', 'registration', 'sign up', 'signup', 'account'],
  items: ['item', 'list', 'crud', 'add', 'delete'],
  checkout: ['checkout', 'payment', 'card', 'order', 'coupon', 'cart'],
  navigation: ['404', 'not found', 'navigation', 'error page'],
};

const tid = (id: string) => `[data-testid="${id}"]`;
type Step = Omit<TestCaseStep, 'step_number'>;
const go = (path: string): Step => ({ action: 'navigate', instruction: `Open ${path}`, value: path });
const fill = (id: string, value: string, what: string): Step => ({ action: 'fill', instruction: `Enter ${what}`, selector: tid(id), value });
const click = (id: string, what: string): Step => ({ action: 'click', instruction: `Click ${what}`, selector: tid(id) });
const seeText = (id: string, value: string): Step => ({ action: 'assert_text', instruction: `Check the page shows "${value}"`, selector: tid(id), value });
const seeUrl = (value: string): Step => ({ action: 'assert_url', instruction: `Check the URL contains ${value}`, value });
const seeVisible = (id: string, what: string): Step => ({ action: 'assert_visible', instruction: `Check ${what} is visible`, selector: tid(id) });

const shipping: Step[] = [
  go('/checkout'),
  fill('ship-name', 'Ada Lovelace', 'the full name'),
  fill('ship-address', '1 Main Street', 'the street address'),
  fill('ship-city', 'Springfield', 'the city'),
  fill('ship-zip', '12345', 'the ZIP code'),
  click('ship-next', 'Continue to payment'),
];
const payment = (card: string): Step[] => [
  fill('pay-card', card, 'the card number'),
  fill('pay-expiry', '12/30', 'the expiry date'),
  fill('pay-cvc', '123', 'the CVC'),
  click('pay-next', 'Review order'),
];

interface Fixture extends Omit<GeneratedTestCase, 'steps'> {
  area: Area;
  steps: Step[];
}

const FIXTURES: Fixture[] = [
  {
    area: 'login',
    title: 'Log in with the demo account',
    description: 'A registered user can sign in and lands on their dashboard.',
    steps: [
      go('/login'),
      fill('login-email', 'demo@qaforge.dev', 'the demo email'),
      fill('login-password', 'Demo1234!', 'the demo password'),
      click('login-submit', 'Log in'),
      seeUrl('/dashboard'),
      seeText('dashboard-welcome', 'Welcome back, demo@qaforge.dev'),
    ],
    expected_result: 'The dashboard opens and greets the demo user.',
    priority: 'critical',
    type: 'smoke',
    tags: ['login', 'auth'],
  },
  {
    area: 'login',
    title: 'Wrong password shows an error',
    description: 'Signing in with a wrong password is refused with a clear message.',
    steps: [
      go('/login'),
      fill('login-email', 'demo@qaforge.dev', 'the demo email'),
      fill('login-password', 'wrong-pass1', 'a wrong password'),
      click('login-submit', 'Log in'),
      seeText('login-error', 'Invalid email or password'),
      seeUrl('/login'),
    ],
    expected_result: 'The user stays on the login page and sees "Invalid email or password".',
    priority: 'high',
    type: 'negative',
    tags: ['login', 'auth'],
  },
  {
    area: 'login',
    title: 'Login requires an email',
    description: 'Submitting the login form empty asks for an email first.',
    steps: [go('/login'), click('login-submit', 'Log in'), seeText('login-error', 'Email is required')],
    expected_result: 'The form shows "Email is required".',
    priority: 'medium',
    type: 'negative',
    tags: ['login', 'validation'],
  },
  {
    area: 'login',
    title: 'Dashboard sends signed-out visitors to login',
    description: 'The dashboard is private: a signed-out visitor is redirected to the login page.',
    steps: [go('/dashboard'), seeUrl('/login?next=/dashboard'), seeVisible('login-form', 'the login form')],
    expected_result: 'The login page opens with the dashboard as the return address.',
    priority: 'high',
    type: 'functional',
    tags: ['login', 'auth'],
  },
  {
    area: 'register',
    title: 'Register a new account',
    description: 'A visitor can create an account with valid details.',
    steps: [
      go('/register'),
      fill('register-name', 'Ada Lovelace', 'the full name'),
      fill('register-email', 'ada@example.com', 'a new email'),
      fill('register-password', 'Analytical1', 'a valid password'),
      fill('register-confirm', 'Analytical1', 'the same password again'),
      click('register-submit', 'Create account'),
      seeText('register-success', 'Account created for ada@example.com'),
    ],
    expected_result: 'The page confirms the account was created.',
    priority: 'high',
    type: 'functional',
    tags: ['register', 'signup'],
  },
  {
    area: 'register',
    title: 'Registration rejects mismatched passwords',
    description: 'The two password fields must match.',
    steps: [
      go('/register'),
      fill('register-name', 'Ada Lovelace', 'the full name'),
      fill('register-email', 'ada@example.com', 'a new email'),
      fill('register-password', 'Analytical1', 'a valid password'),
      fill('register-confirm', 'Different1', 'a different password'),
      click('register-submit', 'Create account'),
      seeText('register-error-confirm', 'Passwords do not match'),
      seeVisible('register-form', 'the registration form'),
    ],
    expected_result: 'The form stays open and shows "Passwords do not match".',
    priority: 'medium',
    type: 'negative',
    tags: ['register', 'validation'],
  },
  {
    area: 'items',
    title: 'Add and delete a shopping list item',
    description: 'Items can be added to and removed from the shopping list.',
    steps: [
      go('/items'),
      seeText('item-count', '2 items'),
      fill('item-name', 'Milk', 'a new item name'),
      click('item-add', 'Add'),
      seeText('item-list', 'Milk'),
      seeText('item-count', '3 items'),
      click('item-delete-milk', 'Delete next to Milk'),
      seeText('item-count', '2 items'),
    ],
    expected_result: 'Milk appears in the list, then disappears after Delete.',
    priority: 'high',
    type: 'functional',
    tags: ['items', 'crud'],
  },
  {
    area: 'items',
    title: 'Item name is required',
    description: 'An empty item cannot be added.',
    steps: [go('/items'), click('item-add', 'Add'), seeText('item-error', 'Item name is required')],
    expected_result: 'The list shows "Item name is required" and adds nothing.',
    priority: 'medium',
    type: 'negative',
    tags: ['items', 'validation'],
  },
  {
    area: 'checkout',
    title: 'Complete checkout in three steps',
    description: 'Shipping, payment and review lead to a placed order.',
    steps: [
      ...shipping,
      seeText('checkout-step', 'Step 2 of 3'),
      ...payment('4242 4242 4242 4242'),
      seeText('review-card', 'Card ending 4242'),
      click('place-order', 'Place order'),
      seeText('order-number', 'QF-1001'),
    ],
    expected_result: 'The order is placed and shows order number QF-1001.',
    priority: 'critical',
    type: 'smoke',
    tags: ['checkout', 'payment'],
  },
  {
    area: 'checkout',
    title: 'Checkout rejects a short card number',
    description: 'A card number must have 16 digits.',
    steps: [...shipping, ...payment('4242'), seeText('pay-error', 'Card number must be 16 digits')],
    expected_result: 'Payment shows "Card number must be 16 digits" and does not continue.',
    priority: 'high',
    type: 'negative',
    tags: ['checkout', 'payment', 'validation'],
  },
  {
    area: 'checkout',
    title: 'Coupon SAVE10 takes 10% off the total',
    description:
      'Fails on purpose: the demo shop has a planted coupon bug, so you can see how QA Forge reports a failed step and files a bug.',
    steps: [
      ...shipping,
      ...payment('4242 4242 4242 4242'),
      fill('review-coupon', 'SAVE10', 'the coupon code SAVE10'),
      click('apply-coupon', 'Apply'),
      seeText('coupon-message', 'applied'),
      seeText('review-total', '$108.00'),
    ],
    expected_result: 'The total drops from $120.00 to $108.00.',
    priority: 'high',
    type: 'functional',
    tags: ['checkout', 'coupon', 'known-bug'],
  },
  {
    area: 'navigation',
    title: 'Unknown page shows not found',
    description: 'A missing page explains itself and links back to the shop.',
    steps: [
      go('/no-such-page'),
      seeText('not-found-title', 'Page not found'),
      click('not-found-home', 'Back to the shop'),
      seeText('home-title', 'Acme Shop'),
    ],
    expected_result: 'The not found page links back to the home page.',
    priority: 'low',
    type: 'edge_case',
    tags: ['navigation'],
  },
];

/** The fixtures as validated cases, tagged local-demo. Invalid fixtures throw: they are a code bug. */
const CASES = FIXTURES.map(({ area, steps, tags, ...rest }) => ({
  area,
  testCase: GeneratedTestCaseSchema.parse({
    ...rest,
    tags: [...tags, LOCAL_DEMO_PROVIDER],
    steps: steps.map((s, i) => ({ ...s, step_number: i + 1 })),
  }),
}));

/**
 * Pick the demo cases that match the prompt's words (all of them when nothing matches).
 * ponytail: keyword match, not language understanding; it only has to route demo prompts.
 */
export function localDemoTestCases(prompt: string): GeneratedTestCase[] {
  const text = prompt.toLowerCase();
  const areas = (Object.keys(AREA_KEYWORDS) as Area[]).filter((a) => AREA_KEYWORDS[a].some((k) => text.includes(k)));
  const picked = areas.length ? CASES.filter((c) => areas.includes(c.area)) : CASES;
  return picked.map((c) => c.testCase);
}
