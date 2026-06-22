import type { Server, Socket } from 'socket.io';
import { supabase } from '../../config/supabase.js';
import { runTest, type BrowserName } from '@qaforge/playwright-runner';
import { generateTestCases } from '@qaforge/ai-engine';
import logger from '../../utils/logger.js';
import { resolveAIKey } from '../../utils/resolve-ai-key.js';
import { acquireSlot, releaseSlot } from '../../middleware/concurrency-limiter.js';
import type { ApiKeyProvider, TestCaseStep } from '@qaforge/shared-types';

/**
 * Payload sent by the client to start a test execution.
 */
interface TestStartPayload {
  test_run_id: string;
  test_case_id?: string;
  project_id: string;
  /** If provided, AI generates steps from this prompt at run time */
  nl_input?: string;
}

/**
 * Register test execution event handlers on a connected socket.
 *
 * Flow:
 *   1. Client emits `test:start` with a run ID
 *   2. Server validates ownership, fetches the test case steps
 *   3. If nl_input is provided (AI-driven), generate Playwright steps via AI
 *   4. Launches Playwright, streams step events back to client via socket
 *   5. On completion, updates DB and auto-creates a Bug if the run failed
 */
export async function executeTestOrchestration(
  io: Server | undefined,
  socket: Socket | undefined,
  userId: string,
  payload: TestStartPayload
) {
  const { test_run_id, project_id } = payload;
  const roomName = `test:${test_run_id}`;

  // ── 0. Acquire a concurrency slot ─────────────────────────────────────────
  // Single source of truth for the per-user concurrent-run cap. Acquired here
  // (covers BOTH the HTTP POST path and the ws `test:start` path) and released
  // in the `finally` below, so a slot can never leak regardless of which exit
  // path runs. `slotAcquired` guards the release so we never decrement a slot
  // we didn't take.
  let slotAcquired = false;

  try {
      slotAcquired = await acquireSlot(userId);
      if (!slotAcquired) {
        io?.to(roomName).emit('test:error', {
          test_run_id,
          message: 'Too many concurrent runs. Wait for a running test to finish, then try again.',
        });
        socket?.emit('test:error', {
          test_run_id,
          message: 'Too many concurrent runs. Wait for a running test to finish, then try again.',
        });
        await supabase
          .from('test_runs')
          .update({
            status: 'error',
            error_message: 'Too many concurrent runs',
            completed_at: new Date().toISOString(),
          })
          .eq('id', test_run_id);
        return;
      }

      // ── 1. Validate the test run ──────────────────────────────────────────
      const { data: run, error: runError } = await supabase
        .from('test_runs')
        .select('*, test_cases(title, steps, suite_id)')
        .eq('id', test_run_id)
        .eq('project_id', project_id)
        .eq('user_id', userId)
        .single();

      if (runError || !run) {
        // Emit only to the requesting socket — do NOT join the room
        socket?.emit('test:unauthorized', { test_run_id, message: 'Test run not found or unauthorized' });
        return;
      }

      if (run.status !== 'pending') {
        socket?.emit('test:error', { test_run_id, message: `Run is already ${run.status}` });
        return;
      }

      // ── Ownership confirmed — join the room now ───────────────────────────
      socket?.join(roomName);

      // ── 2. Get project base URL ───────────────────────────────────────────
      const { data: project } = await supabase
        .from('projects')
        .select('base_url')
        .eq('id', project_id)
        .single();

      const baseUrl = project?.base_url;
      if (!baseUrl) {
        io?.to(roomName).emit('test:error', {
          test_run_id,
          message: 'Project has no base URL configured. Set it in project settings.',
        });
        await supabase
          .from('test_runs')
          .update({ status: 'error', error_message: 'No base URL configured' })
          .eq('id', test_run_id);
        return;
      }

      // ── 3. Resolve test steps ─────────────────────────────────────────────
      let steps: TestCaseStep[];

      if (run.test_cases && Array.isArray(run.test_cases.steps) && run.test_cases.steps.length > 0) {
        // Use existing test case steps
        steps = run.test_cases.steps as TestCaseStep[];
      } else if (run.nl_input) {
        // AI-driven: generate steps from natural language
        io?.to(roomName).emit('test:status', { test_run_id, message: 'Generating test steps from AI...' });

        // Find a valid API key for AI generation
        let resolvedKey;
        try {
          resolvedKey = await resolveAIKey(userId);
        } catch {
          io?.to(roomName).emit('test:error', { test_run_id, message: 'No valid AI keys found' });
          await supabase
            .from('test_runs')
            .update({ status: 'error', error_message: 'No valid AI keys' })
            .eq('id', test_run_id);
          return;
        }

        const aiResult = await generateTestCases({
          prompt: run.nl_input,
          provider: resolvedKey.provider,
          apiKey: resolvedKey.apiKey,
          baseUrl,
        });

        if (aiResult.test_cases.length === 0) {
          io?.to(roomName).emit('test:error', { test_run_id, message: 'AI generated no test cases' });
          await supabase
            .from('test_runs')
            .update({ status: 'error', error_message: 'AI generated no test cases' })
            .eq('id', test_run_id);
          return;
        }

        // Use the first generated test case's steps
        steps = aiResult.test_cases[0].steps;
      } else {
        io?.to(roomName).emit('test:error', { test_run_id, message: 'No test case or NL input provided' });
        await supabase
          .from('test_runs')
          .update({ status: 'error', error_message: 'No steps to execute' })
          .eq('id', test_run_id);
        return;
      }

      // ── 4. Mark run as running ────────────────────────────────────────────
      const startedAt = new Date().toISOString();
      await supabase
        .from('test_runs')
        .update({ status: 'running', started_at: startedAt })
        .eq('id', test_run_id);

      io?.to(roomName).emit('test:running', { test_run_id, started_at: startedAt });

      // ── 5. Execute via Playwright ─────────────────────────────────────────
      const result = await runTest({
        baseUrl,
        steps,
        browser: (run.browser as BrowserName) || 'chromium',
        onStepStart: (stepNumber, action) => {
          io?.to(roomName).emit('test:step:start', {
            test_run_id,
            step_number: stepNumber,
            action,
          });
        },
        onStepComplete: async (stepResult) => {
          try {
            // Persist step to DB
            const { data: insertedStep } = await supabase
              .from('test_steps')
              .insert({
                test_run_id,
                step_number: stepResult.step_number,
                action: stepResult.action,
                selector: stepResult.selector ?? null,
                value: stepResult.value ?? null,
                status: stepResult.status,
                error_message: stepResult.error_message ?? null,
                duration_ms: stepResult.duration_ms,
                metadata: {},
              })
              .select('id')
              .single();

            // Upload screenshot if present
            let screenshotUrl: string | undefined;
            if (stepResult.screenshot_buffer) {
              const screenshotPath = `screenshots/${test_run_id}/step_${stepResult.step_number}.png`;
              const { error: uploadError } = await supabase.storage
                .from('test-artifacts')
                .upload(screenshotPath, stepResult.screenshot_buffer, {
                  contentType: 'image/png',
                  upsert: true,
                });

              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from('test-artifacts')
                  .getPublicUrl(screenshotPath);
                screenshotUrl = urlData.publicUrl;

                // Update the step with screenshot URL
                if (insertedStep) {
                  await supabase
                    .from('test_steps')
                    .update({ screenshot_url: screenshotUrl })
                    .eq('id', insertedStep.id);
                }
              }
            }

            io?.to(roomName).emit('test:step:complete', {
              test_run_id,
              step_number: stepResult.step_number,
              status: stepResult.status,
              screenshot_url: screenshotUrl,
              error_message: stepResult.error_message,
              duration_ms: stepResult.duration_ms,
            });
          } catch (callbackErr) {
            logger.error('Error in onStepComplete callback', callbackErr);
            // Even if DB save or screenshot upload fails, notify client of the step complete event
            io?.to(roomName).emit('test:step:complete', {
              test_run_id,
              step_number: stepResult.step_number,
              status: stepResult.status,
              error_message: stepResult.error_message ?? (callbackErr instanceof Error ? callbackErr.message : String(callbackErr)),
              duration_ms: stepResult.duration_ms,
            });
          }
        },
        onScreenshot: (stepNumber, buffer) => {
          try {
            // Stream screenshot as base64 for live preview
            io?.to(roomName).emit('test:screenshot', {
              test_run_id,
              step_number: stepNumber,
              screenshot_base64: buffer.toString('base64'),
            });
          } catch (err) {
            logger.error('Error in onScreenshot callback', err);
          }
        },
      });

      // ── 6. Finalize run ───────────────────────────────────────────────────
      const completedAt = new Date().toISOString();
      const finalStatus = result.passed ? 'passed' : 'failed';

      await supabase
        .from('test_runs')
        .update({
          status: finalStatus,
          duration_ms: result.total_duration_ms,
          error_message: result.error_message ?? null,
          completed_at: completedAt,
        })
        .eq('id', test_run_id);

      io?.to(roomName).emit('test:complete', {
        test_run_id,
        status: finalStatus,
        duration_ms: result.total_duration_ms,
        error_message: result.error_message,
      });

      // ── 7. Auto-create bug on failure ─────────────────────────────────────
      if (!result.passed) {
        const failedStep = result.steps.find((s) => s.status === 'failed');
        const screenshotUrls: string[] = [];

        // Collect screenshot URLs from failed steps
        if (failedStep?.screenshot_buffer) {
          const path = `screenshots/${test_run_id}/step_${failedStep.step_number}.png`;
          const { data: urlData } = supabase.storage
            .from('test-artifacts')
            .getPublicUrl(path);
          if (urlData.publicUrl) screenshotUrls.push(urlData.publicUrl);
        }

        const bugTitle = failedStep
          ? `Test failure at step ${failedStep.step_number}: ${failedStep.action.substring(0, 100)}`
          : `Test run ${test_run_id} failed`;

        const { data: bug } = await supabase
          .from('bugs')
          .insert({
            project_id,
            test_run_id,
            title: bugTitle,
            description: result.error_message ?? 'Test run failed',
            actual_behavior: failedStep?.error_message ?? result.error_message ?? 'Unknown failure',
            severity: 'medium',
            status: 'open',
            screenshot_urls: screenshotUrls,
            browser: run.browser ?? 'chromium',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id, title')
          .single();

        if (bug) {
          io?.to(roomName).emit('test:bug_created', {
            test_run_id,
            bug_id: bug.id,
            bug_title: bug.title,
          });

          logger.info({
            event: 'test:auto_bug',
            testRunId: test_run_id,
            bugId: bug.id,
          });
        }
      }

      logger.info({
        event: 'test:complete',
        testRunId: test_run_id,
        status: finalStatus,
        durationMs: result.total_duration_ms,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.error({
        event: 'test:execution_error',
        testRunId: test_run_id,
        error: errorMsg,
      });

      // Update run status to error
      await supabase
        .from('test_runs')
        .update({
          status: 'error',
          error_message: errorMsg,
          completed_at: new Date().toISOString(),
        })
        .eq('id', test_run_id);

      io?.to(roomName).emit('test:error', {
        test_run_id,
        message: errorMsg,
      });

      // Leave the room on unhandled error to prevent stale subscriptions
      socket?.leave(roomName);
    } finally {
      // Always release the concurrency slot we acquired — success, early
      // return, or thrown error. Guarded so an unacquired slot is never
      // released (which would wrongly decrement another in-flight run).
      if (slotAcquired) {
        await releaseSlot(userId);
      }
    }
}

export function registerTestHandlers(io: Server, socket: Socket): void {
  // Validate ownership before allowing a socket to subscribe to run events.
  // An attacker emitting 'test:join' for another user's run ID must not receive
  // any broadcasts emitted to that room.
  socket.on('test:join', async (payload: { test_run_id: string }) => {
    const userId = socket.data.userId as string;
    const { test_run_id } = payload;

    const { data: run, error } = await supabase
      .from('test_runs')
      .select('id')
      .eq('id', test_run_id)
      .eq('user_id', userId)
      .single();

    if (error || !run) {
      socket.emit('test:unauthorized', { test_run_id, message: 'Unauthorized' });
      return;
    }

    socket.join(`test:${test_run_id}`);
  });

  socket.on('test:start', (payload: TestStartPayload) => {
    const userId = socket.data.userId as string;
    // Do NOT join the room here — executeTestOrchestration joins only after
    // confirming ownership, preventing unauthorized sockets from subscribing.
    executeTestOrchestration(io, socket, userId, payload).catch((err) => {
      logger.error('Error in executeTestOrchestration', err);
    });
  });
}
