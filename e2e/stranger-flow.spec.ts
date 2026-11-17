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
  // the element appears before its image has loaded: wait for real pixels rather than reading the width once
  await expect.poll(() => shots.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // F2: "Run again" starts a new run of the same case, from a clean page, and it passes too.
  const firstRun = page.url();
  await page.getByRole('button', { name: 'Run this test case again' }).click();
  await expect(page).not.toHaveURL(firstRun);
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Log in with the demo account' })).toBeVisible();
  await expect(page.getByText('All steps passed')).toBeVisible({ timeout: 90_000 });

  // And from the Runs tab: the newest row starts a third run.
  const secondRun = page.url();
  await page.getByRole('button', { name: /Back to project/ }).click();
  await page.getByRole('tab', { name: /Runs/ }).click();
  await page.getByRole('button', { name: 'Run Log in with the demo account again' }).first().click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  expect([firstRun, secondRun]).not.toContain(page.url());
});

test('the planted coupon bug fails the run and files a bug', async ({ page }) => {
  await runCase(page, 'Coupon SAVE10 takes 10% off the total');
  await expect(page.getByText(/Test failure at step 14/).first()).toBeVisible({ timeout: 90_000 });
  // F7: the failed step says where the page was and what the browser reported, live and after a reload.
  await expect(page.getByText('What the browser reported')).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await page.getByText('What the browser reported').click();
  await expect(page.getByText('Page address')).toBeVisible();
  await expect(page.getByText(/^http:\/\/127\.0\.0\.1:4100\//)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy details' })).toBeVisible();
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

test('a suite exports as one Playwright file and as a spreadsheet', async ({ page }) => {
  const { readFile } = await import('node:fs/promises');
  await page.goto(projectUrl);

  // F11. One file, one test per case, the finder helper once.
  await page.getByRole('button', { name: `Export ${suite}` }).click();
  const [spec] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Playwright file/ }).click()]);
  expect(spec.suggestedFilename()).toMatch(/^e2e-suite-\d{4}-\d{2}-\d{2}\.spec\.ts$/);
  const code = await readFile((await spec.path())!, 'utf8');
  const tests = code.match(/^test\(/gm) ?? [];
  expect(tests.length).toBeGreaterThan(1);
  expect(code).toContain('test("E2E plain sentences", async ({ page }) => {');
  expect(code).toContain(`const BASE_URL = "${DEMO_SHOP}"`);
  expect(code.match(/^async function find\(/gm)).toHaveLength(1);
  await expect(page.getByText(`Exported ${tests.length} test cases`)).toBeVisible();

  // The spreadsheet has a header and a row per step.
  await page.getByRole('button', { name: `Export ${suite}` }).click();
  const [sheet] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Spreadsheet/ }).click()]);
  expect(sheet.suggestedFilename()).toMatch(/\.csv$/);
  const csv = (await readFile((await sheet.path())!, 'utf8')).replace(/^﻿/, '');
  expect(csv.split('\r\n')[0]).toBe('Case,Priority,Type,Step,Action,Description,Element,Value');
  expect(csv).toMatch(/\r\nE2E plain sentences,\w+,\w+,1,navigate,/);
});

test('a whole suite runs case by case, shows the totals, and can be stopped', async ({ page }) => {
  await page.goto(projectUrl);
  await page.getByRole('button', { name: `Run suite ${suite}` }).click();
  await expect(page).toHaveURL(/\/batches\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: `Suite run: ${suite}` })).toBeVisible();
  // The suite holds passing cases, the planted bug and the slow case, so it ends with both results.
  await expect(page.getByText(/^Finished, \d+ cases?$/)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText('Passed', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Failed', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop this suite run' })).toBeHidden();

  // A row opens that case's run.
  await page.getByRole('listitem').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/runs\//);

  // Start it again and stop it: nothing is left waiting.
  await page.goto(projectUrl);
  await page.getByRole('button', { name: `Run suite ${suite}` }).click();
  await expect(page).toHaveURL(/\/batches\//);
  await page.getByRole('button', { name: 'Stop this suite run' }).click();
  await expect(page.getByText(/^Finished, \d+ cases?$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Stopped by you before it finished.').first()).toBeVisible();
});

test('a secret variable logs in without its value appearing in the run or the exported script', async ({ page }) => {
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: /Variables/ }).click();
  await page.getByRole('button', { name: 'Add variable' }).first().click();
  await page.getByLabel('Name').fill('password'); // typed in lower case; the field makes it PASSWORD
  await page.getByLabel('Value').fill('Demo1234!');
  await page.getByRole('button', { name: 'Add variable' }).last().click();
  await expect(page.getByText('Variable added')).toBeVisible();
  await expect(page.getByText('PASSWORD', { exact: true })).toBeVisible();
  await expect(page.getByText('Hidden', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo1234!')).toHaveCount(0);

  await page.getByRole('tab', { name: /Suites/ }).click();
  await page.getByText(suite, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Add case' }).click();
  await page.getByLabel('Title').fill('E2E secret login');
  const sentences = [
    'Open /login',
    'Type "demo@qaforge.dev" into Email',
    'Type "{{PASSWORD}}" into Password',
    'Click "Log in"',
    'Check page address contains /dashboard',
  ];
  for (const [i, sentence] of sentences.entries()) {
    if (i) await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel(`Step ${i + 1} description`).fill(sentence);
  }
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Test case created')).toBeVisible();

  await runCase(page, 'E2E secret login');
  await expect(page.getByText('All steps passed')).toBeVisible({ timeout: 90_000 }); // the real password reached the shop
  await expect(page.getByText('Type "{{PASSWORD}}" into Password', { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain('Demo1234!');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export/ }).click()]);
  const code = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8');
  expect(code).toContain("process.env.PASSWORD ?? ''");
  expect(code).not.toContain('Demo1234!');
});

test('a project token starts a suite run from outside the app, and stops working when deleted', async ({ page, request }) => {
  const API = 'http://localhost:4000';
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: /Automation/ }).click();
  await page.getByRole('button', { name: 'New token' }).first().click();
  await page.getByLabel('Name').fill('E2E build');
  await page.getByRole('button', { name: 'Create token' }).click();
  const secret = await page.getByLabel('Token', { exact: true }).inputValue(); // shown once
  expect(secret).toMatch(/^qf_/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('E2E build', { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(secret); // gone from the page for good

  // The snippet names a real suite of this project; use that id the way a build would.
  const snippet = await page.getByLabel('GitHub Actions workflow step').innerText();
  const suiteId = /QAFORGE_SUITE: ([0-9a-f-]{36})/.exec(snippet)?.[1];
  expect(suiteId).toBeTruthy();
  const auth = { Authorization: `Bearer ${secret}` };
  const started = await request.post(`${API}/api/ci/suites/${suiteId}/run`, { headers: auth });
  expect(started.status()).toBe(201);
  const { batch_id } = await started.json();
  await expect
    .poll(async () => (await (await request.get(`${API}/api/ci/batches/${batch_id}`, { headers: auth })).json()).status, { timeout: 180_000 })
    .not.toBe('running');

  // The same suite run shows in the app.
  await page.goto(`${projectUrl}/batches/${batch_id}`);
  await expect(page.getByText(/^Finished, \d+ cases?$/)).toBeVisible();

  await page.goto(projectUrl);
  await page.getByRole('tab', { name: /Automation/ }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete token E2E build' }).click();
  await expect(page.getByText('Token deleted')).toBeVisible();
  expect((await request.post(`${API}/api/ci/suites/${suiteId}/run`, { headers: auth })).status()).toBe(401);
});

test('a suite can be scheduled, paused and unscheduled', async ({ page }) => {
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: /Automation/ }).click();
  await page.getByRole('button', { name: `Schedule ${suite}`, exact: true }).click();
  await page.getByLabel('Repeat').click();
  await page.getByRole('option', { name: 'Every week' }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.getByLabel('Day').click();
  await page.getByRole('option', { name: 'Friday' }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.getByLabel('Time').click();
  await page.getByRole('option', { name: '06:00' }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByText('Schedule saved')).toBeVisible();
  await expect(page.getByText(/Every Friday at 06:00 \(.+\) · next run Fri/)).toBeVisible();

  await page.reload(); // it is saved, not just shown
  await page.getByRole('tab', { name: /Automation/ }).click();
  await page.getByRole('button', { name: `Change the schedule of ${suite}` }).click();
  await page.getByLabel('On', { exact: true }).click();
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Change the schedule of ${suite}` }).click();
  await page.getByRole('button', { name: 'Remove schedule' }).click();
  await expect(page.getByText('Schedule removed')).toBeVisible();
  await expect(page.getByRole('button', { name: `Schedule ${suite}`, exact: true })).toBeVisible();
});

// Last: it renames the suite the tests above open by name.
test('a Slack address can be saved without ever being shown again, and removed', async ({ page }) => {
  // F10. A made-up address: it is only stored here, no message is sent.
  const address = 'https://hooks.slack.com/services/T000FAKE/B000FAKE/e2e-synthetic-address-Zk4q';
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: /Automation/ }).click();
  const field = page.getByLabel('Slack incoming-webhook address');
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });

  // Only a Slack address can be saved.
  await field.fill('https://example.com/services/T/B/x');
  await expect(saveButton).toBeDisabled();
  await field.fill(address);
  await saveButton.click();
  await expect(page.getByText('Slack address saved')).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved address ends in Zk4q')).toBeVisible();

  // After a reload the page knows it is connected but does not have the address.
  await page.reload();
  await page.getByRole('tab', { name: /Automation/ }).click();
  await expect(page.getByText('Saved address ends in Zk4q')).toBeVisible();
  await expect(page.getByLabel('Replace the address')).toHaveValue('');
  expect(await page.content()).not.toContain('e2e-synthetic-address');

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('Slack notices turned off')).toBeVisible();
  await expect(page.getByLabel('Slack incoming-webhook address')).toBeVisible();
});

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

test('cases can be searched, duplicated, reordered and moved, and runs and bugs filtered', async ({ page }) => {
  // F6. Search finds a case by words in a step, across suites, and shows which suite it is in.
  await page.goto(projectUrl);
  // A second suite to move a case into.
  await page.getByRole('button', { name: 'New suite' }).click();
  await page.getByLabel(/Suite name/).fill('F6 target');
  await page.getByRole('dialog').getByRole('button', { name: 'Create suite' }).click();
  await expect(page.getByText('Suite created')).toBeVisible();
  await page.getByLabel('Search test cases').fill('save10');
  await expect(page.getByText(/^1 test case matches$/)).toBeVisible();
  const found = page.locator('li', { hasText: 'Coupon SAVE10 takes 10% off the total' });
  await expect(found.getByText('E2E suite renamed')).toBeVisible();

  // Duplicate it from the search results; the copy is found too.
  await found.getByRole('button', { name: /^More actions for / }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.getByText('Test case duplicated')).toBeVisible();
  await expect(page.getByText(/^2 test cases match$/)).toBeVisible();

  // Edit the copy: move its first step down, rename it, save.
  const copy = 'Coupon SAVE10 takes 10% off the total (copy)';
  await page.getByRole('button', { name: `Edit ${copy}` }).click();
  const firstStep = await page.getByLabel('Step 1 description').inputValue();
  const secondStep = await page.getByLabel('Step 2 description').inputValue();
  await expect(page.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move step 1 down' }).click();
  await expect(page.getByLabel('Step 1 description')).toHaveValue(secondStep);
  await expect(page.getByLabel('Step 2 description')).toHaveValue(firstStep);
  await page.getByLabel('Title').fill('F6 reordered copy');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Test case saved')).toBeVisible();

  // The notices stack over the row buttons at the bottom right: let them clear (they stay while the pointer is on them).
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 });

  // The order was saved, and the original is untouched.
  await expect(page.getByText(/^2 test cases match$/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit F6 reordered copy' }).click();
  await expect(page.getByLabel('Step 1 description')).toHaveValue(secondStep);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Edit Coupon SAVE10 takes 10% off the total', exact: true }).click();
  await expect(page.getByLabel('Step 1 description')).toHaveValue(firstStep);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Move the copy to another suite.
  await page.getByRole('button', { name: 'More actions for F6 reordered copy' }).click();
  await page.getByRole('menuitem', { name: 'Move to suite' }).click();
  await page.getByRole('menuitem', { name: 'F6 target' }).click();
  await expect(page.getByText('Moved to F6 target')).toBeVisible();
  await expect(page.locator('li', { hasText: 'F6 reordered copy' }).getByText('F6 target')).toBeVisible();

  // Clearing the box brings the suites back.
  await page.getByLabel('Search test cases').fill('zzz-no-such-case');
  await expect(page.getByText('No test case has that in its title or steps.')).toBeVisible();
  await page.getByLabel('Search test cases').fill('');
  await expect(page.getByRole('button', { name: 'Run suite E2E suite renamed' })).toBeVisible();

  // Runs: only failed ones, then none in a status nothing has.
  await page.getByRole('tab', { name: /Runs/ }).click();
  await page.getByLabel('Filter runs by status').click();
  await page.getByRole('option', { name: 'Failed' }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  const runRows = page.getByRole('tabpanel').locator('li');
  await expect(runRows.first()).toBeVisible();
  await expect(runRows.filter({ hasText: 'Passed' })).toHaveCount(0);
  await page.getByLabel('Filter runs by status').click();
  await page.getByRole('option', { name: 'Pending' }).click();
  await expect(page.getByText('No runs match these filters.')).toBeVisible();

  // Bugs: search by a word of the title.
  await page.getByRole('tab', { name: /Bugs/ }).click();
  await page.getByLabel('Search bugs').fill('zzz-no-such-bug');
  await expect(page.getByText('No bugs match these filters.')).toBeVisible();
  await page.getByLabel('Search bugs').fill('test failure');
  await expect(page.getByRole('tabpanel').locator('li').first()).toBeVisible();
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
