// QA-3: the stranger flow, in the browser, with no AI key:
// sign in → project on the demo shop → local demo drafts → approve → run → passed with
// screenshots → planted bug → failed with a bug → manual slow case → refresh mid-run stays live.
import { expect, test, type Page } from '@playwright/test';

const DEMO_SHOP = 'http://127.0.0.1:4100/';
const project = `E2E demo shop ${Date.now()}`;
const suite = 'E2E suite';

test.describe.configure({ mode: 'serial' });

let projectUrl = '';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('alice@qaforge.dev');
  await page.locator('input[type="password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects/);
}

async function openSuite(page: Page) {
  await page.goto(projectUrl);
  await page.getByText(suite, { exact: true }).first().click();
}

async function runCase(page: Page, title: string) {
  await openSuite(page);
  await page.locator('li', { hasText: title }).getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page).toHaveURL(/\/runs\//);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('generate drafts without a key, approve some, and save only those', async ({ page }) => {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill(project);
  await page.getByLabel('Base URL').fill(DEMO_SHOP);
  await page.getByRole('button', { name: 'Create project' }).last().click();
  await page.getByRole('link', { name: new RegExp(project) }).click();
  // The list card shows the name too, so wait for the project's own page before keeping its URL.
  await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('button', { name: 'AI generate' })).toBeVisible();
  projectUrl = page.url();

  await page.getByRole('button', { name: 'AI generate' }).click();
  await page.getByLabel('Describe the feature or flow').fill('Test the login page and the checkout with a coupon');
  await page.getByPlaceholder(/Suite name/).fill(suite);
  await page.getByRole('button', { name: 'Generate drafts' }).click();

  // Drafts are reviewable and nothing is saved yet.
  await expect(page.getByText(/Nothing is saved yet/)).toBeVisible();
  await expect(page.getByText(/Local demo, not AI/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove draft Login requires an email' }).click();
  await page.getByRole('button', { name: /Save \d+ test cases/ }).click();
  await expect(page.getByText('Test cases saved')).toBeVisible();
  await page.getByRole('button', { name: 'View test cases' }).click();

  await openSuite(page);
  await expect(page.locator('li', { hasText: 'Log in with the demo account' })).toBeVisible();
  await expect(page.locator('li', { hasText: 'Login requires an email' })).toHaveCount(0);
});

test('a generated case runs in a real browser and passes, with screenshots', async ({ page }) => {
  await runCase(page, 'Log in with the demo account');
  await expect(page.getByText('All steps passed')).toBeVisible({ timeout: 90_000 });
  const shots = page.locator('img[src*="/object/sign/"]');
  await expect(shots.first()).toBeVisible();
  expect(await shots.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('the planted coupon bug fails the run and files a bug', async ({ page }) => {
  await runCase(page, 'Coupon SAVE10 takes 10% off the total');
  await expect(page.getByText(/Test failure at step 14/).first()).toBeVisible({ timeout: 90_000 });
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: /Bugs/ }).click();
  await expect(page.getByText(/Test failure at step 14/).first()).toBeVisible();
});

test('a manual case from the step editor stays live through a refresh mid-run', async ({ page }) => {
  await openSuite(page);
  await page.getByRole('button', { name: 'Add case' }).click();
  await page.getByLabel('Title').fill('E2E slow case');

  // Step 1 through the action picker, step 2 as a sentence the editor reads.
  await page.getByLabel('Step 1 action').click();
  await page.getByRole('option', { name: 'Open page', exact: true }).click();
  await page.getByLabel('Step 1 description').fill('Open the login page');
  await page.getByLabel('Step 1 value').fill('/login');

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step 2 description').fill('Wait until "Spring sale" is shown');
  await expect(page.getByLabel('Step 2 element')).toHaveValue('Spring sale');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Test case created')).toBeVisible();

  await runCase(page, 'E2E slow case');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  // exact: the step row only; once step 1 has passed, the log line "Step 1: Open the login page [passed]" matches too
  await expect(page.getByText('Open the login page', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.reload(); // mid-run: the page must reconnect live and recover the saved step
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('Open the login page', { exact: true })).toBeVisible();
  await expect(page.getByText(/Couldn't find anything showing "Spring sale" on \/login/).first()).toBeVisible({ timeout: 60_000 });
});

test('a running test can be stopped', async ({ page }) => {
  await runCase(page, 'E2E slow case'); // its second step waits 15 s for text that never shows
  await expect(page.getByText('Open the login page', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Stop this test run' }).click();
  await expect(page.getByText('Stopped by you before it finished.').first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('button', { name: 'Stop this test run' })).toBeHidden();
  await page.reload(); // the stop is saved, not just shown
  await expect(page.getByText('Stopped by you before it finished.').first()).toBeVisible();
});

test('a case written in plain sentences, with no selectors, passes', async ({ page }) => {
  await openSuite(page);
  await page.getByRole('button', { name: 'Add case' }).click();
  await page.getByLabel('Title').fill('E2E plain sentences');
  const sentences = [
    'Open /login',
    'Type "demo@qaforge.dev" into Email',
    'Type "Demo1234!" into Password',
    'Click "Log in"',
    'Check page address contains /dashboard',
    'Check "Welcome back, demo@qaforge.dev" is shown',
  ];
  for (const [i, sentence] of sentences.entries()) {
    if (i) await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel(`Step ${i + 1} description`).fill(sentence);
  }
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Test case created')).toBeVisible();

  await runCase(page, 'E2E plain sentences');
  await expect(page.getByText('All steps passed')).toBeVisible({ timeout: 90_000 });

  // A fast run can finish between the page's first load and its live connection. Force that: the first
  // load says "running"; the page must catch up and still end with the normal final line.
  let first = true;
  await page.route(/\/api\/projects\/[^/]+\/test-runs\/[0-9a-f-]{36}$/, async (route) => {
    if (!first || route.request().method() !== 'GET') return route.continue();
    first = false;
    const response = await route.fetch();
    const body = await response.json();
    body.test_run = { ...body.test_run, status: 'running', completed_at: null };
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByText(/All steps passed/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Passed', { exact: true }).first()).toBeVisible();
  await page.unroute(/\/api\/projects\/[^/]+\/test-runs\/[0-9a-f-]{36}$/);
});

test('a step with a missing part is marked in the editor instead of failing later', async ({ page }) => {
  await openSuite(page);
  await page.getByRole('button', { name: 'Add case' }).click();
  await page.getByLabel('Title').fill('E2E incomplete');
  await page.getByLabel('Step 1 action').click();
  await page.getByRole('option', { name: 'Click', exact: true }).click();
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('"Click" needs an element: the text you see on it, its label, or a selector')).toBeVisible();
  await expect(page.getByText('Test case created')).toHaveCount(0);
});

test('Export script downloads a test that finds elements by their words', async ({ page }) => {
  await runCase(page, 'E2E plain sentences');
  await expect(page.getByText('All steps passed')).toBeVisible({ timeout: 90_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export/ }).click()]);
  const code = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8');
  expect(code).toContain('await page.goto(new URL("/login", BASE_URL).toString());');
  expect(code).toContain('(await find(page, "Email", "field")).fill("demo@qaforge.dev");');
  expect(code).toContain('await expect.poll(() => page.url()).toContain("/dashboard");');
});

// Last: it renames the suite the tests above open by name.
test('the project, a suite and a bug can be edited', async ({ page }) => {
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Edit project' }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(`${project} (edited)`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: `${project} (edited)` })).toBeVisible();

  await page.getByRole('button', { name: `Rename ${suite}` }).click();
  await page.getByRole('dialog').getByLabel(/Suite name/).fill(`${suite} renamed`);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`${suite} renamed`, { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: /Bugs/ }).click();
  await page.getByLabel(/^Status of /).first().click();
  await page.getByRole('option', { name: 'Resolved' }).click();
  await expect(page.getByText('Bug status updated')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /Bugs/ }).click();
  await expect(page.getByLabel(/^Status of /).first()).toHaveText('Resolved');
});

test('record a login by clicking and typing in the live viewport, then replay it green', async ({ page, context }) => {
  // Where the demo login fields sit at the recorder's 1280x720 viewport (same page, same layout).
  const probe = await context.newPage();
  await probe.setViewportSize({ width: 1280, height: 720 });
  await probe.goto(`${DEMO_SHOP}login`);
  const box = async (id: string) => (await probe.getByTestId(id).boundingBox())!;
  const at = { email: await box('login-email'), password: await box('login-password'), submit: await box('login-submit') };
  await probe.close();

  await page.goto(projectUrl);
  await page.getByRole('tab', { name: /Recordings/ }).click();
  await page.getByRole('button', { name: /Record session|Start first recording/ }).first().click();
  await page.getByLabel(/Session name/).fill('E2E recorded login');
  await page.getByLabel(/Target base URL/).fill(`${DEMO_SHOP}login`);
  await page.getByRole('button', { name: 'Launch browser' }).click();
  await expect(page).toHaveURL(/\/recordings\//);
  const screen = page.getByAltText('Recorded browser viewport');
  await expect(screen).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Click and type in the screen below/)).toBeVisible();

  // Click a browser-pixel position on the displayed (letterboxed) frame, as a person would.
  const clickAt = async (b: { x: number; y: number; width: number; height: number }) => {
    const r = (await screen.boundingBox())!;
    const scale = Math.min(r.width / 1280, r.height / 720);
    const ox = (r.width - 1280 * scale) / 2;
    const oy = (r.height - 720 * scale) / 2;
    await page.mouse.click(r.x + ox + (b.x + b.width / 2) * scale, r.y + oy + (b.y + b.height / 2) * scale);
  };
  await clickAt(at.email);
  await page.keyboard.type('demo@qaforge.dev');
  await clickAt(at.password);
  await page.keyboard.type('Demo1234!');
  await clickAt(at.submit);
  await expect(page.getByText('Log in', { exact: true })).toBeVisible({ timeout: 20_000 }); // the click was recorded
  await expect(page.getByText('Email', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Conclude session' }).click();
  await page.getByRole('button', { name: /Compile & replay/ }).click();
  await expect(page).toHaveURL(/\/runs\//, { timeout: 30_000 });
  await expect(page.getByText('All steps passed')).toBeVisible({ timeout: 90_000 });
});
