import type { Server } from 'socket.io';
import { runTest, type BrowserName, type RunStatus, type StepResult } from '@qaforge/playwright-runner';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';
import { ARTIFACT_BUCKET, screenshotPath, signArtifacts } from '../utils/artifacts.js';
import { acquireSlot, releaseSlot } from '../middleware/concurrency-limiter.js';

const INTERRUPTED = 'Interrupted: the API stopped while this run was in progress. Start it again.';

/** Runs executing in this process, so shutdown can cancel them and record why. */
const inFlight = new Map<string, { controller: AbortController; done: Promise<void> }>();

/**
 * Boot-time recovery: a run left `pending`/`running` by a previous process can never finish.
 * ponytail: assumes a single API instance (TD-3). With several instances this would reap
 * live runs on other instances; add an owner/heartbeat column before scaling out.
 */
export async function reapInterruptedRuns(): Promise<number> {
  const { data, error } = await supabase
    .from('test_runs')
    .update({ status: 'error', error_message: INTERRUPTED, completed_at: new Date().toISOString() })
    .in('status', ['pending', 'running'])
    .select('id');
  if (error) throw new Error(`Could not reap interrupted runs: ${error.message}`);
  return data?.length ?? 0;
}

/** Graceful shutdown: cancel in-flight runs and wait (bounded) for them to record `error`. */
export async function shutdownRuns(timeoutMs = 15_000): Promise<void> {
  const runs = [...inFlight.values()];
  runs.forEach((r) => r.controller.abort());
  await Promise.race([
    Promise.allSettled(runs.map((r) => r.done)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ]);
}

export interface ExecuteRunPayload {
  test_run_id: string;
  project_id: string;
}

/**
 * The single owner of run execution (TD-3). Started only by HTTP routes after
 * they insert a `pending` run; sockets only observe the `test:<id>` room.
 *
 * - Claims the run atomically (`pending` → `running` in one conditional UPDATE),
 *   so a second call for the same run is a no-op.
 * - Every DB/storage write is checked; a failed write ends the run as `error`.
 * - Every terminal path sets `completed_at`. The bug is filed after all steps
 *   are persisted and before the final status is written.
 */
export async function executeTestOrchestration(
  io: Server | undefined,
  userId: string,
  { test_run_id, project_id }: ExecuteRunPayload,
): Promise<void> {
  const room = io?.to(`test:${test_run_id}`);
  const startedMs = Date.now();

  /** Write the terminal state of a run this call has claimed, then notify observers. */
  const finalize = async (status: RunStatus, error_message: string | null, extra: { duration_ms?: number } = {}) => {
    const { error } = await supabase
      .from('test_runs')
      .update({ status, error_message, completed_at: new Date().toISOString(), ...extra })
      .eq('id', test_run_id)
      .eq('status', 'running');
    if (error) logger.error({ event: 'run:finalize_failed', testRunId: test_run_id, error: error.message });
    if (status === 'error') room?.emit('test:error', { test_run_id, message: error_message });
    room?.emit('test:complete', { test_run_id, status, duration_ms: extra.duration_ms, error_message });
    logger.info({ event: 'run:complete', testRunId: test_run_id, status, durationMs: Date.now() - startedMs });
  };

  // ── Atomic claim (before anything else, so duplicates never touch the run) ──
  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('test_runs')
    .update({ status: 'running', started_at: startedAt })
    .eq('id', test_run_id)
    .eq('project_id', project_id)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('id, browser, test_case_id')
    .maybeSingle();
  if (claimError || !claimed) {
    logger.warn({
      event: 'run:claim_skipped',
      testRunId: test_run_id,
      reason: claimError?.message ?? 'not pending or not owned',
    });
    return;
  }
  room?.emit('test:running', { test_run_id, started_at: startedAt });

  const controller = new AbortController();
  let markDone!: () => void;
  inFlight.set(test_run_id, { controller, done: new Promise<void>((resolve) => (markDone = resolve)) });

  let slotAcquired = false;
  try {
    slotAcquired = await acquireSlot(userId);
    if (!slotAcquired) {
      await finalize('error', 'Too many concurrent runs. Wait for a running test to finish, then try again.');
      return;
    }

    // ── Inputs ───────────────────────────────────────────────────────────────
    const [{ data: project, error: projectError }, { data: testCase, error: caseError }] = await Promise.all([
      supabase.from('projects').select('base_url').eq('id', project_id).single(),
      claimed.test_case_id
        ? supabase.from('test_cases').select('steps').eq('id', claimed.test_case_id).single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (projectError || caseError) throw new Error(`Could not load run inputs: ${(projectError ?? caseError)!.message}`);
    if (!project?.base_url) {
      await finalize('error', 'Project has no base URL configured. Set it in project settings.');
      return;
    }
    if (!testCase) {
      await finalize('error', 'Run has no test case to execute');
      return;
    }

    // ── Execute ──────────────────────────────────────────────────────────────
    // Screenshots go to the private bucket; rows keep the path, readers get signed URLs (EXE-3).
    const screenshotPaths = new Map<number, string>();

    const persistStep = async (step: StepResult) => {
      let screenshot_url: string | null = null;
      if (step.screenshot_buffer) {
        const path = screenshotPath(test_run_id, step.step_number);
        const { error: uploadError } = await supabase.storage
          .from(ARTIFACT_BUCKET)
          .upload(path, step.screenshot_buffer, { contentType: 'image/png', upsert: true });
        if (uploadError) throw new Error(`Screenshot upload failed for step ${step.step_number}: ${uploadError.message}`);
        screenshot_url = path;
        screenshotPaths.set(step.step_number, path);
      }

      const { error: insertError } = await supabase.from('test_steps').insert({
        test_run_id,
        step_number: step.step_number,
        action: step.action,
        instruction: step.instruction,
        selector: step.selector ?? null,
        value: step.value ?? null,
        status: step.status,
        error_message: step.error_message ?? null,
        duration_ms: step.duration_ms,
        screenshot_url,
        metadata: {},
      });
      if (insertError) throw new Error(`Could not save step ${step.step_number}: ${insertError.message}`);

      // Watchers get a signed URL; no image bytes travel over the socket. The row is already
      // saved, so a signing hiccup only costs the live preview (the page reloads it on complete).
      const [signedShot] =
        room && screenshot_url ? await signArtifacts([screenshot_url]).catch(() => [null]) : [null];
      room?.emit('test:step:complete', {
        test_run_id,
        step_number: step.step_number,
        instruction: step.instruction,
        status: step.status,
        screenshot_url: signedShot ?? undefined,
        error_message: step.error_message,
        duration_ms: step.duration_ms,
      });
    };

    const result = await runTest({
      baseUrl: project.base_url,
      steps: Array.isArray(testCase.steps) ? testCase.steps : [],
      browser: (claimed.browser as BrowserName) || 'chromium',
      allowedPrivateHosts: env.ALLOWED_PRIVATE_HOSTS,
      signal: controller.signal,
      onStepStart: (step_number, instruction) => {
        room?.emit('test:step:start', { test_run_id, step_number, action: instruction });
      },
      onStepComplete: persistStep,
    });

    // ── Bug for genuine failures (after every step is persisted) ─────────────
    let errorMessage = controller.signal.aborted ? INTERRUPTED : (result.error_message ?? null);
    if (result.status === 'failed') {
      const failedStep = result.steps.find((s) => s.status === 'failed');
      const shot = failedStep && screenshotPaths.get(failedStep.step_number);
      const now = new Date().toISOString();
      const { data: bug, error: bugError } = await supabase
        .from('bugs')
        .insert({
          project_id,
          test_run_id,
          title: failedStep
            ? `Test failure at step ${failedStep.step_number}: ${failedStep.instruction.substring(0, 100)}`
            : `Test run ${test_run_id} failed`,
          description: errorMessage ?? 'Test run failed',
          actual_behavior: failedStep?.error_message ?? errorMessage ?? 'Unknown failure',
          severity: 'medium',
          status: 'open',
          screenshot_urls: shot ? [shot] : [],
          browser: claimed.browser ?? 'chromium',
          created_at: now,
          updated_at: now,
        })
        .select('id, title')
        .single();
      if (bugError || !bug) {
        logger.error({ event: 'run:bug_insert_failed', testRunId: test_run_id, error: bugError?.message });
        errorMessage = `${errorMessage ?? 'Test failed'} (bug could not be filed: ${bugError?.message ?? 'unknown'})`;
      } else {
        room?.emit('test:bug_created', { test_run_id, bug_id: bug.id, bug_title: bug.title });
      }
    }

    await finalize(result.status, errorMessage, { duration_ms: result.total_duration_ms });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'run:execution_error', testRunId: test_run_id, error: message });
    await finalize('error', controller.signal.aborted ? INTERRUPTED : message);
  } finally {
    if (slotAcquired) await releaseSlot(userId).catch(() => {});
    inFlight.delete(test_run_id);
    markDone();
  }
}
