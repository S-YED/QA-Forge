import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { decrypt } from '../utils/encryption.js';
import logger from '../utils/logger.js';

// F10: tell a project's Slack channel when a suite run ends with failures.
//
// The webhook address is a credential and the request leaves our network, so:
//  - only https://hooks.slack.com/services/... is ever accepted or called (checked on save AND before sending),
//  - redirects are refused, the call times out, and the address is never logged or returned to a client.

/** True for a Slack incoming-webhook address and nothing else. */
export function isSlackWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'hooks.slack.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith('/services/') &&
      url.pathname.length > '/services/'.length
    );
  } catch {
    return false;
  }
}

/** The one place that calls Slack; a property so tests can replace it. Throws when Slack does not accept the message. */
export const slack = {
  async post(webhookUrl: string, text: string): Promise<void> {
    if (!isSlackWebhook(webhookUrl)) throw new Error('Not a Slack webhook address');
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Slack answered ${res.status}`);
  },
};

/** Slack reads < > & as markup; names typed by users must stay plain text. */
const plain = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface SuiteRunSummary {
  projectId: string;
  projectName: string;
  suiteName: string;
  batchId: string;
  total: number;
  passed: number;
  failed: number;
  error: number;
  /** titles of the cases that did not pass, in suite order */
  notPassed: string[];
}

/** The message for a finished suite run, or null when there is nothing to report (everything passed). */
export function suiteRunMessage(s: SuiteRunSummary): string | null {
  const bad = s.failed + s.error;
  if (bad === 0) return null;
  const link = `${env.CORS_ORIGINS[0].replace(/\/$/, '')}/dashboard/projects/${s.projectId}/batches/${s.batchId}`;
  const shown = s.notPassed.slice(0, 10).map((t) => `• ${plain(t)}`);
  if (s.notPassed.length > shown.length) shown.push(`• and ${s.notPassed.length - shown.length} more`);
  return [
    `:x: *${plain(s.suiteName)}* in ${plain(s.projectName)}: ${bad} of ${s.total} test ${s.total === 1 ? 'case' : 'cases'} did not pass (${s.passed} passed, ${s.failed} failed, ${s.error} with an error).`,
    ...shown,
    `<${link}|Open the suite run in QA Forge>`,
  ].join('\n');
}

/** The project's saved webhook address, or null. Only this module reads it in clear. */
export async function loadSlackWebhook(projectId: string): Promise<string | null> {
  const { data } = await supabase.from('project_notifications').select('slack_webhook_encrypted').eq('project_id', projectId).maybeSingle();
  return data ? decrypt(data.slack_webhook_encrypted) : null;
}

/** What a run the user stopped is recorded as (run-executor's STOPPED; repeated here to avoid importing the executor). */
const STOPPED_PREFIX = 'Stopped by you';

/**
 * Called once a suite run has finished executing. Sends nothing when the project has no webhook, when every
 * case passed, or when the only non-passes are runs the user stopped. Never throws: a notice that cannot be
 * delivered must not affect the run.
 */
export async function notifySuiteRun(batchId: string, projectId: string): Promise<void> {
  try {
    const webhook = await loadSlackWebhook(projectId);
    if (!webhook) return;

    const [{ data: batch }, { data: runs }] = await Promise.all([
      supabase.from('run_batches').select('id, test_suites(name), projects(name)').eq('id', batchId).maybeSingle(),
      supabase.from('test_runs').select('status, error_message, test_cases(title)').eq('batch_id', batchId).order('created_at', { ascending: true }),
    ]);
    if (!batch || !runs?.length) return;
    // Still pending or running: the API is shutting down mid-run; say nothing rather than half a result.
    if (runs.some((r) => r.status === 'pending' || r.status === 'running')) return;

    const counted = runs.filter((r) => !(r.status === 'error' && (r.error_message ?? '').startsWith(STOPPED_PREFIX)));
    const text = suiteRunMessage({
      projectId,
      projectName: (batch.projects as unknown as { name: string } | null)?.name ?? 'your project',
      suiteName: (batch.test_suites as unknown as { name: string } | null)?.name ?? 'A suite',
      batchId,
      total: runs.length,
      passed: counted.filter((r) => r.status === 'passed').length,
      failed: counted.filter((r) => r.status === 'failed').length,
      error: counted.filter((r) => r.status === 'error').length,
      notPassed: counted
        .filter((r) => r.status !== 'passed')
        .map((r) => (r.test_cases as unknown as { title: string } | null)?.title ?? 'A deleted test case'),
    });
    if (!text) return;

    await slack.post(webhook, text);
    logger.info({ event: 'notify:slack_sent', batchId, projectId });
  } catch (err) {
    // The message never contains the address; log only what went wrong.
    logger.warn({ event: 'notify:slack_failed', batchId, projectId, error: err instanceof Error ? err.message : String(err) });
  }
}
