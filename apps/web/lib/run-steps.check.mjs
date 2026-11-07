// Runnable check for run-steps.ts (no test runner in apps/web yet; QA-3 adds E2E):
//   node apps/web/lib/run-steps.check.mjs      (Node 22.6+ strips the TypeScript types)
import assert from 'node:assert/strict';
import { isRunActive, mergeSavedSteps, upsertStep } from './run-steps.ts';

// A complete event for a step whose start was missed is inserted, in order, not dropped.
let steps = [{ step_number: 1, status: 'passed' }];
steps = upsertStep(steps, { step_number: 3, status: 'running' });
steps = upsertStep(steps, { step_number: 2, status: 'failed', error_message: 'x' });
assert.deepEqual(steps.map((s) => [s.step_number, s.status]), [[1, 'passed'], [2, 'failed'], [3, 'running']]);

// Updating keeps earlier fields (e.g. a screenshot that arrived before the complete event).
steps = upsertStep([{ step_number: 1, status: 'running', screenshot_base64: 'img' }], { step_number: 1, status: 'passed' });
assert.deepEqual(steps, [{ step_number: 1, status: 'passed', screenshot_base64: 'img' }]);

// A reload after reconnecting: saved results replace stale live ones; the live running step stays.
const live = [{ step_number: 1, status: 'running' }, { step_number: 4, status: 'running' }];
const saved = [{ step_number: 1, status: 'passed' }, { step_number: 2, status: 'passed' }, { step_number: 3, status: 'failed' }];
assert.deepEqual(mergeSavedSteps(live, saved).map((s) => `${s.step_number}:${s.status}`), ['1:passed', '2:passed', '3:failed', '4:running']);
assert.deepEqual(mergeSavedSteps([], []), []);

assert.equal(isRunActive('pending'), true);
assert.equal(isRunActive('running'), true);
for (const s of ['passed', 'failed', 'error']) assert.equal(isRunActive(s), false);

console.log('run-steps: all checks passed');
