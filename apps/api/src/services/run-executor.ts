import type { Server } from 'socket.io';
import { runTest, type BrowserName, type RunStatus, type StepResult, type TestCaseStep } from '@qaforge/playwright-runner';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import logger from '../utils/logger.js';
import { ARTIFACT_BUCKET, screenshotPath, signArtifacts } from '../utils/artifacts.js';
import { acquireSlot, releaseSlot } from '../middleware/concurrency-limiter.js';
import { loadVariables, maskSecrets, resolveSteps, usesVariables } from './run-variables.js';

const INTERRUPTED = 'Interrupted: the API stopped while this run was in progress. Start it again.';

export const STOPPED = 'Stopped by you before it finished.';

/** Runs executing in this process, so shutdown or the user can cancel them and record why. */
const inFlight = new Map<string, { controller: AbortController; done: Promise<void> }>();

/** Why a cancelled run ended: the user pressed Stop, or the API was shutting down. */
const cancelReason = (signal: AbortSignal) => (signal.reason === STOPPED ? STOPPED : INTERRUPTED);

/** Stop a run this process is executing (F1). False when it is not running here. */
export function stopRun(testRunId: string): boolean {
  const run = inFlight.get(testRunId);
  if (!run) return false;
  run.controller.abort(STOPPED);
  return true;
}

/** Stop those of these runs this process is executing and wait (bounded) until each has ended (G2). */
export async function stopRuns(testRunIds: string[], timeoutMs = 15_000): Promise<void> {
  const runs = testRunIds.flatMap((id) => inFlight.get(id) ?? []);
  runs.forEach((r) => r.controller.abort(STOPPED));
  await Promise.race([
    Promise.allSettled(runs.map((r) => r.done)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ]);
}

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

/** True while shutdown is cancelling runs, so a suite run does not start its next case. */
let draining = false;

/** Graceful shutdown: cancel in-flight runs and wait (bounded) for them to record `error`. */
export async function shutdownRuns(timeoutMs = 15_000): Promise<void> {
  draining = true;
  try {
    const runs = [...inFlight.values()];
    runs.forEach((r) => r.controller.abort());
    await Promise.race([
      Promise.allSettled(runs.map((r) => r.done)),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
    ]);
  } finally {
    draining = false;
  }
}

/**
 * F3: run the cases of a suite run one after another, in the order given. Each run waits for a free
 * slot instead of being refused, so a suite never fails with "too many concurrent runs".
 * A run stopped or deleted meanwhile is skipped by the claim. Runs still pending when the API stops
 * are marked interrupted by `reapInterruptedRuns` on the next start.
 * ponytail: one case at a time per suite run; run two at once (the per-user cap) if suites feel slow.
 */
export async function executeBatch(io: Server | undefined, userId: string, projectId: string, runIds: string[]): Promise<void> {
  for (const test_run_id of runIds) {
    if (draining) return;
    await executeTestOrchestration(io, userId, { test_run_id, project_id: projectId }, { queued: true }).catch((err) =>
      logger.error({ event: 'run:batch_item_failed', testRunId: test_run_id, error: err instanceof Error ? err.message : String(err) }),
    );
  }
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
  { queued = false }: { queued?: boolean } = {},
): Promise<void> {
  const room = io?.to(`test:${test_run_id}`);
  const startedMs = Date.now();

  // F4: hides the project's secret values. Identity until the variables are loaded; from then on every
  // message this run stores, sends to watchers or logs passes through it.
  let mask = <T extends string | null | undefined>(text: T): T => text;

  /** Write the terminal state of a run this call has claimed, then notify observers. */
  const finalize = async (status: RunStatus, reason: string | null, extra: { duration_ms?: number } = {}) => {
    const error_message = mask(reason);
    const { error } = await supabase
      .from('test_runs')
      .update({ status, error_message, completed_at: new Date().toISOString(), ...extra })
      .eq('id', test_run_id)
      .eq('status', 'running');
    if (error) logger.error({ event: 'run:finalize_failed', testRunId: test_run_id, error: error.message });
    if (status === 'error') room?.emit('test:error', { test_run_id, message: error_message });
    room?.emit('test:complete', { test_run_id, status, duration_ms: extra.duration_ms, error_message });
    // The reason goes in the log too, so a failed or errored run is diagnosable without the database.
    logger[status === 'error' ? 'warn' : 'info']({
      event: 'run:complete',
      testRunId: test_run_id,
      userId,
      status,
      durationMs: Date.now() - startedMs,
      ...(error_message ? { errorMessage: error_message } : {}),
    });
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
    if (!slotAcquired && queued) {
      // Part of a suite run: wait for one of the user's other runs to finish, unless stopped meanwhile.
      room?.emit('test:status', { test_run_id, message: 'Waiting for another run to finish' });
      while (!slotAcquired && !controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        slotAcquired = await acquireSlot(userId);
      }
      if (controller.signal.aborted) {
        await finalize('error', cancelReason(controller.signal));
        return;
      }
    }
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

    // ── Project variables (F4) ───────────────────────────────────────────────
    // {{NAME}} in a step's value or element is filled in here, just before the browser starts. The saved
    // case, the step rows, bug reports, live events and logs keep the name; secret values are masked.
    const savedSteps: TestCaseStep[] = Array.isArray(testCase.steps) ? testCase.steps : [];
    const variables = usesVariables(savedSteps) ? await loadVariables(project_id) : [];
    const resolved = resolveSteps(savedSteps, variables);
    if (resolved.missing.length) {
      const names = resolved.missing.join(', ');
      await finalize('error', `${resolved.missing.length === 1 ? 'Variable' : 'Variables'} ${names} not set for this project. Add ${resolved.missing.length === 1 ? 'it' : 'them'} under Variables on the project page.`);
      return;
    }
    mask = (text) => maskSecrets(text, resolved.secrets);
    const asSaved = new Map(savedSteps.map((s) => [s.step_number, s]));

    // ── Execute ──────────────────────────────────────────────────────────────
    // Screenshots go to the private bucket; rows keep the path, readers get signed URLs (EXE-3).
    const screenshotPaths = new Map<number, string>();

    /** F7: what the browser reported up to a failed step, with secrets masked like everything else. */
    const evidenceOf = (step: StepResult | undefined) =>
      step?.diagnostics && {
        url: mask(step.diagnostics.url),
        console: step.diagnostics.console.map((line) => mask(line)),
        requests: step.diagnostics.requests.map((line) => mask(line)),
      };

    const persistStep = async (step: StepResult) => {
      const evidence = evidenceOf(step);
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
        // as saved in the case ({{NAME}} and all), never the filled-in value
        selector: (asSaved.has(step.step_number) ? asSaved.get(step.step_number)!.selector : step.selector) ?? null,
        value: (asSaved.has(step.step_number) ? asSaved.get(step.step_number)!.value : step.value) ?? null,
        status: step.status,
        error_message: mask(step.error_message) ?? null,
        duration_ms: step.duration_ms,
        screenshot_url,
        metadata: evidence ? { diagnostics: evidence } : {},
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
        error_message: mask(step.error_message),
        duration_ms: step.duration_ms,
      });
    };

    // G9: Stop can close the row in the instant after the claim, before this run was listed as in flight (the
    // route then closes it directly). Do not start a browser for a run that is already over.
    // CR-5: only a read that worked can say the run is over; a failed read must not drop a run this process claimed.
    const { data: current, error: currentError } = await supabase.from('test_runs').select('status').eq('id', test_run_id).maybeSingle();
    if (currentError) logger.warn({ event: 'run:status_recheck_failed', testRunId: test_run_id, error: currentError.message });
    else if (current?.status !== 'running') {
      logger.info({ event: 'run:closed_before_start', testRunId: test_run_id, status: current?.status ?? 'gone' });
      return;
    }

    const result = await runTest({
      baseUrl: project.base_url,
      steps: resolved.steps,
      browser: (claimed.browser as BrowserName) || 'chromium',
      allowedPrivateHosts: env.ALLOWED_PRIVATE_HOSTS,
      signal: controller.signal,
      onStepStart: (step_number, instruction) => {
        room?.emit('test:step:start', { test_run_id, step_number, action: instruction });
      },
      onStepComplete: persistStep,
    });

    // ── Bug for genuine failures (after every step is persisted) ─────────────
    // The cancel reason applies only to a run that was cut short. One that finished in the instant a
    // stop arrived keeps its real result, with no "stopped" note on a passed or failed run.
    const cutShort = controller.signal.aborted && result.status === 'error';
    let errorMessage = cutShort ? cancelReason(controller.signal) : (mask(result.error_message) ?? null);
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
          description: [
            errorMessage ?? 'Test run failed',
            // F7: the evidence a developer asks for first, so the bug stands on its own.
            ...((ev) =>
              ev
                ? [
                    `Page address: ${ev.url}`,
                    ...(ev.console.length ? [`Console errors:\n${ev.console.map((l) => `- ${l}`).join('\n')}`] : []),
                    ...(ev.requests.length ? [`Failed requests:\n${ev.requests.map((l) => `- ${l}`).join('\n')}`] : []),
                  ]
                : [])(evidenceOf(failedStep)),
          ].join('\n\n'),
          actual_behavior: mask(failedStep?.error_message) ?? errorMessage ?? 'Unknown failure',
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
    logger.error({ event: 'run:execution_error', testRunId: test_run_id, error: mask(message) });
    await finalize('error', controller.signal.aborted ? cancelReason(controller.signal) : message);
  } finally {
    if (slotAcquired) await releaseSlot(userId).catch(() => {});
    inFlight.delete(test_run_id);
    markDone();
  }
}
