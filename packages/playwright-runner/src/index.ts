import { chromium, firefox, webkit, type Browser, type Page, type BrowserType } from 'playwright';
import type { TestCaseStep, TestStepStatus } from '@qaforge/shared-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BrowserName = 'chromium' | 'firefox' | 'webkit';

export interface RunTestOptions {
  /** The base URL of the application under test */
  baseUrl: string;
  /** The ordered steps to execute */
  steps: TestCaseStep[];
  /** Which browser to use */
  browser?: BrowserName;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Timeout in ms for each step action */
  stepTimeoutMs?: number;
  /** Called when a step starts execution */
  onStepStart?: (stepNumber: number, action: string) => void;
  /** Called when a step completes (pass or fail) */
  onStepComplete?: (result: StepResult) => void;
  /** Called with a screenshot buffer after each step */
  onScreenshot?: (stepNumber: number, screenshotBuffer: Buffer) => void;
}

export interface StepResult {
  step_number: number;
  action: string;
  selector?: string;
  value?: string;
  status: TestStepStatus;
  error_message?: string;
  duration_ms: number;
  screenshot_buffer?: Buffer;
}

export interface RunResult {
  steps: StepResult[];
  total_duration_ms: number;
  passed: boolean;
  error_message?: string;
}

// ── Keyword-to-Playwright Mapping ────────────────────────────────────────────

/**
 * Hybrid approach: keyword mapping first, AI fallback later (MVP-2 scope).
 *
 * Parses a natural-language instruction and maps it to a Playwright action.
 * Supports common patterns like:
 *   - "Click <selector>"
 *   - "Fill/Type <selector> with <value>"
 *   - "Navigate/Go to <url>"
 *   - "Assert/Verify/Check <selector> contains/has text <text>"
 *   - "Wait for <selector>"
 *   - "Select <value> from <selector>"
 *   - "Hover over <selector>"
 *   - "Press <key>"
 */
async function executeStep(page: Page, step: TestCaseStep): Promise<void> {
  const instruction = step.instruction.toLowerCase().trim();
  const selector = step.selector;
  const value = step.value;

  // ── Navigate ──
  if (/^(navigate|go|open|visit|browse)\s*(to\s+)?/i.test(instruction)) {
    const url = value || instruction.replace(/^(navigate|go|open|visit|browse)\s+(to\s+)?/i, '').trim();
    // Resolve relative paths against the current origin via the URL spec:
    // "/login" → origin + /login (NOT appended to the current path, which
    // breaks as soon as the app redirects away from baseUrl).
    const target = url.startsWith('http') ? url : new URL(url, page.url()).toString();
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    return;
  }

  // ── Click ──
  if (/^(click|tap|press)\s+/i.test(instruction) || instruction.includes('click')) {
    if (selector) {
      await page.click(selector);
    } else {
      // Try to find the element by text content
      const text = instruction.replace(/^(click|tap|press)\s+(on\s+)?(the\s+)?/i, '').replace(/\s*button$/i, '').trim();
      await page.click(`text="${text}"`);
    }
    return;
  }

  // ── Fill / Type ──
  if (/^(fill|type|enter|input)\s+/i.test(instruction) || instruction.includes('type') || instruction.includes('fill')) {
    if (selector && value) {
      await page.fill(selector, value);
    } else if (selector && !value) {
      // Try to extract value from instruction
      const matchWith = instruction.match(/(?:with|value)\s+["']?(.+?)["']?\s*$/i);
      const extractedValue = matchWith ? matchWith[1] : '';
      await page.fill(selector, extractedValue);
    }
    return;
  }

  // ── Select dropdown ──
  if (/^select\b/i.test(instruction)) {
    if (selector && value) {
      await page.selectOption(selector, value);
    }
    return;
  }

  // ── Hover ──
  if (/^hover\s+/i.test(instruction) || instruction.includes('hover')) {
    if (selector) {
      await page.hover(selector);
    }
    return;
  }

  // ── Wait ──
  if (/^wait\b/i.test(instruction) || instruction.includes('wait for')) {
    if (selector) {
      await page.waitForSelector(selector);
    } else {
      // Wait a default amount
      await page.waitForTimeout(1000);
    }
    return;
  }

  // ── Press key ──
  if (/^press\s+/i.test(instruction)) {
    const key = instruction.replace(/^press\s+/i, '').trim();
    await page.keyboard.press(key);
    return;
  }

  // ── Assert / Verify ──
  if (/^(assert|verify|check|expect|confirm|ensure)\b/i.test(instruction)) {
    if (selector) {
      const expectedText = step.expected || value || '';
      if (expectedText) {
        const element = page.locator(selector);
        const text = await element.textContent();
        if (!text?.includes(expectedText)) {
          throw new Error(`Assertion failed: expected "${selector}" to contain "${expectedText}" but got "${text}"`);
        }
      } else {
        // Just verify element exists and is visible
        await page.waitForSelector(selector, { state: 'visible' });
      }
    }
    return;
  }

  // ── Scroll ──
  if (/^scroll\s+/i.test(instruction) || instruction.includes('scroll')) {
    if (selector) {
      await page.locator(selector).scrollIntoViewIfNeeded();
    } else {
      await page.evaluate(() => window.scrollBy(0, 300));
    }
    return;
  }

  // ── Fallback: try clicking by text or selector ──
  if (selector) {
    await page.click(selector);
  } else {
    // Last resort: attempt to interpret the instruction as a click on text
    const text = instruction.replace(/^(the\s+)?/i, '').trim();
    await page.click(`text="${text}"`);
  }
}

// ── Browser Factory ──────────────────────────────────────────────────────────

function getBrowserType(name: BrowserName): BrowserType {
  switch (name) {
    case 'chromium': return chromium;
    case 'firefox': return firefox;
    case 'webkit': return webkit;
    default: return chromium;
  }
}

// ── Main Runner ──────────────────────────────────────────────────────────────

/**
 * Execute a sequence of test steps against a live browser.
 *
 * Each step is executed sequentially. A screenshot is taken after each step.
 * If a step fails, the remaining steps are marked as "skipped" and the run
 * terminates.
 */
export async function runTest(options: RunTestOptions): Promise<RunResult> {
  const {
    baseUrl,
    steps,
    browser: browserName = 'chromium',
    viewport = { width: 1280, height: 720 },
    stepTimeoutMs = 15000,
    onStepStart,
    onStepComplete,
    onScreenshot,
  } = options;

  const results: StepResult[] = [];
  const overallStart = Date.now();
  let overallError: string | undefined;
  let browser: Browser | null = null;

  try {
    const browserType = getBrowserType(browserName);
    browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    // Navigate to base URL first
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    let failedAt = -1;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // If a previous step failed, skip all remaining
      if (failedAt >= 0) {
        const skipResult: StepResult = {
          step_number: step.step_number,
          action: step.instruction,
          selector: step.selector,
          value: step.value,
          status: 'skipped' as TestStepStatus,
          duration_ms: 0,
        };
        results.push(skipResult);
        onStepComplete?.(skipResult);
        continue;
      }

      onStepStart?.(step.step_number, step.instruction);
      const stepStart = Date.now();

      try {
        // Set step-level timeout
        await Promise.race([
          executeStep(page, step),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Step timed out after ${stepTimeoutMs}ms`)), stepTimeoutMs)
          ),
        ]);

        // Take screenshot after the step
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        onScreenshot?.(step.step_number, screenshotBuffer);

        const result: StepResult = {
          step_number: step.step_number,
          action: step.instruction,
          selector: step.selector,
          value: step.value,
          status: 'passed' as TestStepStatus,
          duration_ms: Date.now() - stepStart,
          screenshot_buffer: screenshotBuffer,
        };
        results.push(result);
        onStepComplete?.(result);

      } catch (err) {
        failedAt = i;
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Take screenshot of the failure state
        let screenshotBuffer: Buffer | undefined;
        try {
          screenshotBuffer = await page.screenshot({ type: 'png' });
          onScreenshot?.(step.step_number, screenshotBuffer);
        } catch {
          // Screenshot capture itself might fail
        }

        const result: StepResult = {
          step_number: step.step_number,
          action: step.instruction,
          selector: step.selector,
          value: step.value,
          status: 'failed' as TestStepStatus,
          error_message: errorMsg,
          duration_ms: Date.now() - stepStart,
          screenshot_buffer: screenshotBuffer,
        };
        results.push(result);
        onStepComplete?.(result);
        overallError = `Step ${step.step_number} failed: ${errorMsg}`;
      }
    }
  } catch (err) {
    overallError = err instanceof Error ? err.message : String(err);
  } finally {
    if (browser) {
      await browser.close().catch(() => {/* ignore close errors */});
    }
  }

  const passed = results.every(r => r.status === 'passed');

  return {
    steps: results,
    total_duration_ms: Date.now() - overallStart,
    passed,
    error_message: overallError,
  };
}

export type { TestCaseStep } from '@qaforge/shared-types';
