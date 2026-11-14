// P0-2: the guard for every UI change. Each page, at phone and desktop width, in light and dark:
// no horizontal overflow, no console or page errors, no failed app requests, no serious accessibility violations.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = { phone: { width: 375, height: 812 }, desktop: { width: 1280, height: 800 } } as const;
const THEMES = ['light', 'dark'] as const;

/** Problems seen while a page was open; cleared by `check`. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  // "Failed to load resource" repeats what the response check below reports with its URL.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && problems.push(`console: ${m.text().slice(0, 200)}`));
  page.on('response', (r) => {
    // 4xx/5xx from our own web or API; the 404 page is requested on purpose.
    if (r.status() >= 400 && /localhost|127\.0\.0\.1/.test(r.url()) && !r.url().includes('does-not-exist')) {
      problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });
  return problems;
}

async function check(page: Page, name: string, problems: string[]) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.animate-pulse').first()).toBeHidden({ timeout: 20_000 }).catch(() => {});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')} | ${v.nodes[0].failureSummary?.split('\n')[1]?.trim() ?? ''}`);
  expect.soft(overflow, `${name}: horizontal overflow in px`).toBeLessThanOrEqual(0);
  expect.soft(serious, `${name}: accessibility`).toEqual([]);
  expect.soft([...problems], `${name}: errors`).toEqual([]);
  problems.length = 0;
}

for (const [size, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    test(`every page is healthy: ${size}, ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((t) => localStorage.setItem('qaforge-theme', t), theme);
      const page = await context.newPage();
      const problems = watch(page);

      for (const path of ['/landing', '/login', '/login?view=sign_up', '/does-not-exist']) {
        await page.goto(path);
        await check(page, path, problems);
      }

      await page.goto('/login');
      await page.locator('input[type="email"]').fill('alice@qaforge.dev');
      await page.locator('input[type="password"]').fill('Password123!');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/dashboard\/projects/);
      problems.length = 0; // requests cut off by the redirect after sign-in are not page faults
      await check(page, 'projects', problems);

      await page.getByRole('button', { name: 'New project' }).click();
      await check(page, 'new project dialog', problems);
      await page.keyboard.press('Escape');

      const href = await page.locator('a[href*="/dashboard/projects/"]').first().getAttribute('href');
      expect(href).toBeTruthy();
      await page.goto(href!);
      await check(page, 'project: suites', problems);
      for (const tab of ['Runs', 'Bugs', 'Recordings']) {
        await page.getByRole('tab', { name: new RegExp(tab) }).click();
        await check(page, `project: ${tab}`, problems);
      }

      for (const path of ['/dashboard/settings/ai-keys', '/dashboard/settings/profile', '/dashboard/settings/integrations']) {
        await page.goto(path);
        await check(page, path, problems);
      }
      await context.close();
    });
  }
}
