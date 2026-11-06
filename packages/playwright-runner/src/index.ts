import type { Browser, BrowserContext, Page, Response } from 'playwright';
import { TestCaseStepsSchema, TestStepStatus, type TestCaseStep } from '@qaforge/shared-types';
import { BLOCKED_HEADER, assertAllowedTarget, launchGuardedBrowser } from './target-guard.js';

export { assertAllowedTarget, launchGuardedBrowser } from './target-guard.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BrowserName = 'chromium' | 'firefox' | 'webkit';

/** passed: every step ran and passed. failed: a step failed. error: the run itself broke (invalid steps, browser, target unreachable, cancelled, callback threw). */
export type RunStatus = 'passed' | 'failed' | 'error';

export interface RunTestOptions {
  /** The base URL of the application under test */
  baseUrl: string;
  /** The ordered steps to execute. Validated against the shared contract before any browser launches. */
  steps: unknown[];
  browser?: BrowserName;
  viewport?: { width: number; height: number };
  /** Timeout for each action/assertion (Playwright default timeout) */
  stepTimeoutMs?: number;
  /** Timeout for page navigations */
  navigationTimeoutMs?: number;
  /** Hostnames allowed even though they resolve to private/loopback addresses (`*` = all). Default: none. */
  allowedPrivateHosts?: readonly string[];
  /** Aborting closes the browser and ends the run with status "error" */
  signal?: AbortSignal;
  /** Called when a step starts; awaited */
  onStepStart?: (stepNumber: number, instruction: string) => void | Promise<void>;
  /** Called when a step finishes (passed, failed or skipped); awaited. Throwing ends the run with "error". */
  onStepComplete?: (result: StepResult) => void | Promise<void>;
  /** Called with a screenshot after each executed step; awaited */
  onScreenshot?: (stepNumber: number, screenshotBuffer: Buffer) => void | Promise<void>;
}

export interface StepResult {
  step_number: number;
  action: TestCaseStep['action'];
  instruction: string;
  selector?: string;
  value?: string;
  status: TestStepStatus;
  error_message?: string;
  duration_ms: number;
  screenshot_buffer?: Buffer;
}

export interface RunResult {
  status: RunStatus;
  /** Convenience: status === 'passed' */
  passed: boolean;
  steps: StepResult[];
  total_duration_ms: number;
  error_message?: string;
}

// ── Step execution ────────────────────────────────────────────────────────────

/** Resolve a navigate target against the base URL and check it is allowed. */
async function resolveTarget(value: string, baseUrl: string, allowedPrivateHosts: readonly string[]): Promise<string> {
  const url = new URL(value, baseUrl).toString();
  await assertAllowedTarget(url, allowedPrivateHosts);
  return url;
}

/** A navigation that ended on the guard proxy's block page (e.g. via a redirect) is an error, not a page. */
function throwIfBlocked(response: Response | null) {
  const reason = response?.headers()[BLOCKED_HEADER];
  if (reason) throw new Error(`Blocked: ${reason}`);
}

/** Poll until `check` is true or the timeout passes (assertions that may settle after an action). */
async function waitUntil(page: Page, timeoutMs: number, check: () => Promise<boolean>, failure: () => Promise<string>) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(await failure());
    await page.waitForTimeout(100);
  }
}

async function executeStep(
  page: Page,
  step: TestCaseStep,
  baseUrl: string,
  timeoutMs: number,
  allowedPrivateHosts: readonly string[],
): Promise<void> {
  // Interactions use strict locators (an ambiguous selector fails instead of hitting the wrong element);
  // waits and assertions accept the first match.
  const loc = () => page.locator(step.selector!);
  const value = step.value!;

  switch (step.action) {
    case 'navigate':
      throwIfBlocked(await page.goto(await resolveTarget(value, baseUrl, allowedPrivateHosts), { waitUntil: 'domcontentloaded' }));
      return;
    case 'click':
      await loc().click();
      return;
    case 'fill':
      await loc().fill(value);
      return;
    case 'select':
      await loc().selectOption(value);
      return;
    case 'hover':
      await loc().hover();
      return;
    case 'press':
      if (step.selector) await loc().press(value);
      else await page.keyboard.press(value);
      return;
    case 'wait_for':
    case 'assert_visible':
      await loc().first().waitFor({ state: 'visible' });
      return;
    case 'assert_text': {
      const el = loc().first();
      await el.waitFor({ state: 'visible' });
      await waitUntil(
        page,
        timeoutMs,
        async () => ((await el.textContent()) ?? '').includes(value),
        async () => `Expected ${step.selector} to contain "${value}" but got "${((await el.textContent()) ?? '').trim().slice(0, 200)}"`,
      );
      return;
    }
    case 'assert_url':
      await waitUntil(
        page,
        timeoutMs,
        async () => page.url().includes(value),
        async () => `Expected URL to contain "${value}" but it was ${page.url()}`,
      );
      return;
    case 'scroll':
      if (step.selector) await loc().first().scrollIntoViewIfNeeded();
      else await page.mouse.wheel(0, 600);
      return;
    default: {
      // Unreachable after schema validation; kept so a new action can't be silently ignored.
      const never: never = step.action;
      throw new Error(`Unsupported action: ${String(never)}`);
    }
  }
}

// ── Main Runner ──────────────────────────────────────────────────────────────

/**
 * Execute validated steps in a real browser. Steps run in order; after the
 * first failure the rest are reported as skipped. A run only passes when
 * every step ran and passed.
 */
export async function runTest(options: RunTestOptions): Promise<RunResult> {
  const {
    baseUrl,
    browser: browserName = 'chromium',
    viewport = { width: 1280, height: 720 },
    stepTimeoutMs = 15_000,
    navigationTimeoutMs = 30_000,
    allowedPrivateHosts = [],
    signal,
    onStepStart,
    onStepComplete,
    onScreenshot,
  } = options;

  const overallStart = Date.now();
  const results: StepResult[] = [];
  const finish = (status: RunStatus, error_message?: string): RunResult => ({
    status,
    passed: status === 'passed',
    steps: results,
    total_duration_ms: Date.now() - overallStart,
    error_message,
  });

  const parsed = TestCaseStepsSchema.safeParse(options.steps);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `steps.${i.path.join('.')}: ${i.message}`);
    return finish('error', `Invalid test steps (fix the test case before running): ${issues.join('; ')}`);
  }
  const steps = parsed.data;

  try {
    await assertAllowedTarget(baseUrl, allowedPrivateHosts);
  } catch (err) {
    return finish('error', `Base URL not allowed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  const onAbort = () => void browser?.close().catch(() => {});
  signal?.addEventListener('abort', onAbort);

  const toResult = (step: TestCaseStep, status: TestStepStatus, extra: Partial<StepResult> = {}): StepResult => ({
    step_number: step.step_number,
    action: step.action,
    instruction: step.instruction,
    selector: step.selector,
    value: step.value,
    status,
    duration_ms: 0,
    ...extra,
  });

  try {
    if (signal?.aborted) return finish('error', 'Run cancelled');

    try {
      browser = await launchGuardedBrowser(browserName, allowedPrivateHosts);
    } catch (err) {
      return finish('error', `Browser failed to launch: ${err instanceof Error ? err.message : String(err)}`);
    }
    context = await browser.newContext({ viewport });
    context.setDefaultTimeout(stepTimeoutMs);
    context.setDefaultNavigationTimeout(navigationTimeoutMs);
    const page = await context.newPage();

    try {
      throwIfBlocked(await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }));
    } catch (err) {
      return finish('error', `Could not open base URL ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }

    let failure: string | undefined;
    for (const step of steps) {
      if (failure) {
        const skipped = toResult(step, TestStepStatus.SKIPPED);
        results.push(skipped);
        await onStepComplete?.(skipped);
        continue;
      }

      await onStepStart?.(step.step_number, step.instruction);
      const stepStart = Date.now();
      let error: string | undefined;
      try {
        await executeStep(page, step, baseUrl, stepTimeoutMs, allowedPrivateHosts);
      } catch (err) {
        if (signal?.aborted) return finish('error', 'Run cancelled');
        error = err instanceof Error ? err.message : String(err);
      }

      const screenshot = await page.screenshot({ type: 'png' }).catch(() => undefined);
      if (screenshot) await onScreenshot?.(step.step_number, screenshot);

      const result = toResult(step, error ? TestStepStatus.FAILED : TestStepStatus.PASSED, {
        error_message: error,
        duration_ms: Date.now() - stepStart,
        screenshot_buffer: screenshot,
      });
      results.push(result);
      await onStepComplete?.(result);
      if (error) failure = `Step ${step.step_number} failed: ${error}`;
    }

    if (failure) return finish('failed', failure);
    // ponytail: belt and braces — never report passed unless every step ran and passed.
    const allPassed = results.length === steps.length && results.every((r) => r.status === TestStepStatus.PASSED);
    return allPassed ? finish('passed') : finish('error', 'Not every step was executed');
  } catch (err) {
    // Callback (persistence) failures and unexpected browser errors end the run as an error, never a pass.
    return finish('error', signal?.aborted ? 'Run cancelled' : err instanceof Error ? err.message : String(err));
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

export type { TestCaseStep } from '@qaforge/shared-types';
