// A stranger with no seeded account can register from the sign-in page and sign in again.
// Local Supabase has email confirmation off (supabase/config.toml), so sign-up signs in directly.
import { expect, test } from '@playwright/test';

test('register a new account, then sign in with it', async ({ page, context }) => {
  const email = `e2e-${Date.now()}@qaforge.dev`; // ponytail: leaves one throwaway local user per run
  const password = 'Sturdy-Pass-123!';

  await page.goto('/login');
  await page.getByRole('link', { name: /Sign up/ }).click();
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
});

test('"Create free account" opens the sign-up form', async ({ page }) => {
  await page.goto('/landing');
  await page.getByRole('link', { name: 'Create free account' }).first().click();
  await expect(page.getByText('Create your QA Forge account')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up' })).toBeVisible();
});
