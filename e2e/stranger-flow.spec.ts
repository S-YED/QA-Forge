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

  await page.getByLabel('Step 1 action').click();
  await page.getByRole('option', { name: 'navigate', exact: true }).click();
  await page.getByLabel('Step 1 description').fill('Open the login page');
  await page.getByLabel('Step 1 value').fill('/login');

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step 2 action').click();
  await page.getByRole('option', { name: 'wait_for', exact: true }).click();
  await page.getByLabel('Step 2 description').fill('Wait for a promo banner that never appears');
  await page.getByLabel('Step 2 selector').fill('[data-testid="promo-banner"]');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Test case created')).toBeVisible();

  await runCase(page, 'E2E slow case');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('Open the login page')).toBeVisible({ timeout: 20_000 });

  await page.reload(); // mid-run: the page must reconnect live and recover the saved step
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  await expect(page.getByText('Open the login page')).toBeVisible();
  await expect(page.getByText(/Timeout 15000ms exceeded/).first()).toBeVisible({ timeout: 60_000 });
});
