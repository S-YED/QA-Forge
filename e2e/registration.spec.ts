// A stranger with no seeded account can register from the sign-in page and sign in again.
// Local Supabase has email confirmation off (supabase/config.toml), so sign-up signs in directly.
import { expect, test } from '@playwright/test';

test('register a new account, then sign in with it', async ({ page, context }) => {
  const email = `e2e-${Date.now()}@qaforge.dev`; // ponytail: leaves one throwaway local user per run
  const password = 'Sturdy-Pass-123!';

  await page.goto('/login');
  await page.getByRole('link', { name: /Sign up/ }).click();
  // The sign-up view is its own page now (DD-5): type only once its form is there, or the switch clears the fields.
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects/);

  await context.clearCookies();
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects/);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();

  // U1: a new account is walked to its first run by a checklist that ticks itself from real data.
  const checklist = page.getByRole('region', { name: 'Get your first test running' });
  await expect(checklist.getByText('0 of 3 done')).toBeVisible();
  await checklist.getByRole('button', { name: 'Create project' }).click();
  await page.getByLabel('Name').fill('First project');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await expect(checklist.getByText('1 of 3 done')).toBeVisible();
  await expect(checklist.getByText('Create a project (done)')).toBeAttached();
  await checklist.getByRole('link', { name: 'Add a case in First project' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]{36}$/);

  // Each empty tab offers one way forward.
  await page.getByRole('tab', { name: /Runs/ }).click();
  await page.getByRole('button', { name: 'Open suites' }).click();
  await expect(page.getByRole('tab', { name: /Suites/ })).toHaveAttribute('aria-selected', 'true');
});

test('a forgotten password is reset from the emailed link, and the new one signs in', async ({ page, context, request }) => {
  const email = `e2e-reset-${Date.now()}@qaforge.dev`; // ponytail: one throwaway local user per run, like the test above
  const signIn = async (password: string) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  };

  await page.goto('/login?view=sign_up');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('Old-Pass-123!');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects/);
  await context.clearCookies();

  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByText('Reset your password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send reset password instructions' })).toBeVisible();
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole('button', { name: 'Send reset password instructions' }).click();
  await expect(page.getByText('Check your email for the password reset link')).toBeVisible();

  // Local Supabase keeps outgoing mail in its test inbox (Mailpit) instead of sending it.
  const mail = process.env.E2E_MAIL_URL ?? 'http://127.0.0.1:54324';
  let link = '';
  await expect
    .poll(async () => {
      const found = (await (await request.get(`${mail}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as { messages: { ID: string }[] };
      if (!found.messages.length) return '';
      const message = (await (await request.get(`${mail}/api/v1/message/${found.messages[0].ID}`)).json()) as { Text: string };
      link = /https?:\/\/\S+/.exec(message.Text)?.[0] ?? '';
      return link;
    })
    .toContain('type=recovery');

  // DD-5: the link used to sign in once and drop the person on Projects with no way to set a password.
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password/);
  await page.getByLabel('New password').fill('New-Pass-456!');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects/);

  await context.clearCookies();
  await signIn('Old-Pass-123!');
  await expect(page.getByText('Invalid login credentials')).toBeVisible();
  await signIn('New-Pass-456!');
  await expect(page).toHaveURL(/\/dashboard\/projects/);
});

test('a signed-in person changes their password in Settings, and only the new one signs in', async ({ page, context }) => {
  // G1. A fresh account, so no shared test user changes password.
  const email = `e2e-change-${Date.now()}@qaforge.dev`;
  await page.goto('/login?view=sign_up');
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('First-Pass-123!');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects/);

  await page.goto('/dashboard/settings/profile');
  await page.getByLabel('New password').fill('Second-Pass-456!');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();

  await context.clearCookies();
  for (const [password, works] of [['First-Pass-123!', false], ['Second-Pass-456!', true]] as const) {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    if (works) await expect(page).toHaveURL(/\/dashboard\/projects/);
    else await expect(page.getByText('Invalid login credentials')).toBeVisible();
  }
});

test('a person deletes their account in Settings after confirming, and can no longer sign in', async ({ page }) => {
  // G2. A fresh account, deleted through the page.
  const email = `e2e-delete-${Date.now()}@qaforge.dev`;
  await page.goto('/login?view=sign_up');
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('Delete-Me-123!');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects/);

  await page.goto('/dashboard/settings/profile');
  const box = page.getByRole('alertdialog');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await box.getByRole('button', { name: 'Cancel' }).click();
  await expect(box).toBeHidden();
  await expect(page).toHaveURL(/\/dashboard\/settings\/profile/);

  await page.getByRole('button', { name: 'Delete account' }).click();
  await box.getByRole('button', { name: 'Delete account' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('Your account was deleted')).toBeVisible();

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('Delete-Me-123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid login credentials')).toBeVisible();
});

test('the demo shows a sub-suite under its parent, with its cases', async ({ page }) => {
  // G4. The seed nests "Login Flows" inside "Authentication"; the app used to hide it and its cases.
  await page.goto('/demo');
  await expect(page).toHaveURL(/\/dashboard\/projects$/, { timeout: 30_000 });
  await page.getByRole('link', { name: /E-Commerce Platform/ }).first().click();
  await page.getByRole('tab', { name: /Suites/ }).click();
  const child = page.getByRole('button', { name: /^Login Flows/ }); // its Run, Export, Rename and Delete buttons name it too
  await expect(child).toContainText('Inside Authentication');
  // Running the parent runs its sub-suite too, and its button says how many cases that is.
  await expect(page.getByRole('button', { name: 'Run suite Authentication' })).toHaveAttribute(
    'title',
    'Run all 3 test cases, including 2 in its sub-suite, one after another',
  );
  await child.click();
  await expect(page.getByText('Successful login with valid credentials')).toBeVisible();
});

test('a seeded demo bug shows its steps to reproduce as numbered lines, not JSON (CR-6)', async ({ page }) => {
  await page.goto('/demo');
  await expect(page).toHaveURL(/\/dashboard\/projects$/, { timeout: 30_000 });
  await page.getByRole('link', { name: /E-Commerce Platform/ }).first().click();
  await page.getByRole('tab', { name: /Bugs/ }).click();
  await page.getByRole('button', { name: /Login error message not displayed on Firefox/ }).first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Steps to reproduce' })).toBeVisible();
  await expect(sheet.getByText(/^1\. Navigate to \/login using Firefox$/m)).toBeVisible();
  await expect(sheet.getByText(/"step"/)).toHaveCount(0);
});

test('a reset link that no longer works says so and offers a new one', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByText('This reset link no longer works')).toBeVisible();
  await page.getByRole('link', { name: 'Send a new link' }).click();
  await expect(page.getByText('Reset your password')).toBeVisible();
});

test('the landing page lists what the product does, and no browser it cannot run', async ({ page }) => {
  // U7. It claimed Firefox and WebKit runs (production runs Chromium only) and left out suite runs and the overview.
  await page.goto('/landing');
  await expect(page.getByRole('heading', { name: 'Whole suites, on a schedule or from CI' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project health at a glance' })).toBeVisible();
  await expect(page.getByText(/Firefox|WebKit/)).toHaveCount(0);
});

test('"Create free account" opens the sign-up form', async ({ page }) => {
  await page.goto('/landing');
  await page.getByRole('link', { name: 'Create free account' }).first().click();
  await expect(page.getByText('Create your QA Forge account')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
});
