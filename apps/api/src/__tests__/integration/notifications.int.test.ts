/**
 * F10 Slack notice: the webhook address is accepted only for hooks.slack.com, stored encrypted and never
 * returned; a suite run that ends with a failure posts one message, and a clean run posts none.
 * Prereq: local Supabase with migrations 26 and 31, and Playwright Chromium. Slack itself is never called:
 * the one function that would call it is replaced.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { supabase } from '../../config/supabase.js';
import { isSlackWebhook, slack, suiteRunMessage } from '../../services/notifications.js';
import { USERS, signIn, useApi } from './helpers.js';

const api = useApi();
const SECRET_PART = 'T000FAKE/B000FAKE/synthetic-not-a-real-webhook-9zQx';
const WEBHOOK = `https://hooks.slack.com/services/${SECRET_PART}`;
const PASS = [{ step_number: 1, action: 'assert_visible', instruction: 'Heading', selector: 'h1' }];
const FAIL = [{ step_number: 1, action: 'assert_visible', instruction: 'A button that is not there', selector: '#missing' }];

let target: http.Server;
let token = '';
let aliceToken = '';
let projectId = '';
const sent: { url: string; text: string }[] = [];
const realPost = slack.post;

const path = (suffix = '') => `/projects/${projectId}/notifications${suffix}`;
const json = async <T>(res: Response) => (await res.json()) as T;

async function suiteOf(name: string, cases: [string, unknown[]][]): Promise<string> {
  const suite = await json<{ suite: { id: string } }>(await api(`/projects/${projectId}/test-suites`, token, 'POST', { name }));
  for (const [title, steps] of cases) {
    expect((await api(`/projects/${projectId}/test-suites/${suite.suite.id}/test-cases`, token, 'POST', { title, steps })).status).toBe(201);
  }
  return suite.suite.id;
}

/** Run the suite and wait until every case has finished and the notice had its chance to go out. */
async function runSuite(suiteId: string): Promise<string> {
  const started = await api(`/projects/${projectId}/run-batches`, token, 'POST', { suite_id: suiteId });
  expect(started.status).toBe(201);
  const batchId = (await json<{ batch: { id: string } }>(started)).batch.id;
  const deadline = Date.now() + 120_000;
  for (;;) {
    const { counts } = await json<{ counts: { pending: number; running: number } }>(await api(`/projects/${projectId}/run-batches/${batchId}`, token));
    if (counts.pending + counts.running === 0) break;
    if (Date.now() > deadline) throw new Error('suite run did not finish');
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 1500)); // the notice is sent just after the last case ends
  return batchId;
}

beforeAll(async () => {
  target = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Fixture</title><h1>Hello fixture</h1>'));
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r));
  token = (await signIn(USERS.bob)).token;
  aliceToken = (await signIn(USERS.alice)).token;
  const project = await json<{ project: { id: string } }>(
    await api('/projects', token, 'POST', { name: 'f10 <notify> & co', base_url: `http://127.0.0.1:${(target.address() as AddressInfo).port}/` }),
  );
  projectId = project.project.id;
  slack.post = async (url, text) => {
    sent.push({ url, text });
  };
}, 60_000);

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  slack.post = realPost;
  if (projectId) await api(`/projects/${projectId}`, token, 'DELETE');
  await new Promise<void>((r) => target.close(() => r()));
});

describe('F10 webhook address', () => {
  it('accepts a Slack incoming-webhook address and nothing that only looks like one', () => {
    expect(isSlackWebhook(WEBHOOK)).toBe(true);
    for (const bad of [
      'http://hooks.slack.com/services/T/B/x', // not https
      'https://hooks.slack.com.evil.example/services/T/B/x',
      'https://evil.example/services/T/B/x',
      'https://hooks.slack.com@evil.example/services/T/B/x',
      'https://user:pw@hooks.slack.com/services/T/B/x',
      'https://hooks.slack.com:8443/services/T/B/x',
      'https://hooks.slack.com/services/',
      'https://hooks.slack.com/api/chat.postMessage',
      'https://127.0.0.1/services/T/B/x',
      'not a url',
    ]) {
      expect(isSlackWebhook(bad), bad).toBe(false);
    }
  });

  it('is saved encrypted and never given back', async () => {
    expect(await json(await api(path(), token))).toEqual({ available: true, slack: { configured: false } });
    expect((await api(path('/slack'), token, 'PUT', { webhook_url: 'https://evil.example/services/T/B/x' })).status).toBe(400);
    expect((await api(path('/slack/test'), token, 'POST')).status).toBe(400); // nothing saved yet

    const saved = await api(path('/slack'), token, 'PUT', { webhook_url: `  ${WEBHOOK}  ` });
    expect(saved.status).toBe(200);
    const savedText = await saved.text();
    expect(JSON.parse(savedText)).toEqual({ slack: { configured: true, hint: WEBHOOK.slice(-4) } });
    expect(savedText).not.toContain(SECRET_PART);

    const read = await (await api(path(), token)).text();
    expect(JSON.parse(read).slack).toMatchObject({ configured: true, hint: WEBHOOK.slice(-4) });
    expect(read).not.toContain(SECRET_PART);

    const { data: row } = await supabase.from('project_notifications').select('slack_webhook_encrypted').eq('project_id', projectId).single();
    expect(row!.slack_webhook_encrypted).not.toContain('hooks.slack.com');

    // Saving again replaces it: still one row for the project.
    expect((await api(path('/slack'), token, 'PUT', { webhook_url: WEBHOOK })).status).toBe(200);
    const { count } = await supabase.from('project_notifications').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    expect(count).toBe(1);
  });

  it('belongs to the project owner only', async () => {
    expect((await api(path(), aliceToken)).status).toBe(404);
    expect((await api(path('/slack'), aliceToken, 'PUT', { webhook_url: WEBHOOK })).status).toBe(404);
    expect((await api(path('/slack/test'), aliceToken, 'POST')).status).toBe(404);
    expect((await api(path('/slack'), aliceToken, 'DELETE')).status).toBe(404);
    expect(sent).toEqual([]);
    expect(await json<{ slack: { configured: boolean } }>(await api(path(), token))).toMatchObject({ slack: { configured: true } });
  });

  it('sends a test message, and reports a refusal without showing the address', async () => {
    expect((await api(path('/slack/test'), token, 'POST')).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(WEBHOOK);
    expect(sent[0].text).toContain('f10  notify    co'); // the project name, with < > & taken out

    slack.post = async () => {
      throw new Error('Slack answered 404');
    };
    const refused = await api(path('/slack/test'), token, 'POST');
    expect(refused.status).toBe(502);
    const body = await refused.text();
    expect(body).toContain('Slack answered 404');
    expect(body).not.toContain(SECRET_PART);
    slack.post = async (url, text) => {
      sent.push({ url, text });
    };
  });
});

describe('F10 notice after a suite run', () => {
  it('writes a message only when something did not pass, with names kept as plain text', () => {
    const base = { projectId: 'p1', projectName: 'Shop <b>', suiteName: 'Check & out', batchId: 'b1', total: 3 };
    expect(suiteRunMessage({ ...base, passed: 3, failed: 0, error: 0, notPassed: [] })).toBeNull();
    const text = suiteRunMessage({ ...base, passed: 1, failed: 1, error: 1, notPassed: ['Pay <now>', 'Login'] })!;
    expect(text).toContain('*Check &amp; out* in Shop &lt;b&gt;: 2 of 3 test cases did not pass (1 passed, 1 failed, 1 with an error).');
    expect(text).toContain('• Pay &lt;now&gt;');
    expect(text).toContain('/dashboard/projects/p1/batches/b1|Open the suite run in QA Forge>');
    const many = suiteRunMessage({ ...base, total: 14, passed: 0, failed: 14, error: 0, notPassed: Array.from({ length: 14 }, (_, i) => `Case ${i + 1}`) })!;
    expect(many).toContain('• Case 10');
    expect(many).not.toContain('• Case 11');
    expect(many).toContain('• and 4 more');
  });

  it('posts once when a case fails, naming the suite and the case', async () => {
    const batchId = await runSuite(await suiteOf('Checkout', [['Opens', PASS], ['Finds the button', FAIL]]));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(WEBHOOK);
    expect(sent[0].text).toContain('*Checkout* in f10 &lt;notify&gt; &amp; co: 1 of 2 test cases did not pass (1 passed, 1 failed, 0 with an error).');
    expect(sent[0].text).toContain('• Finds the button');
    expect(sent[0].text).not.toContain('• Opens');
    expect(sent[0].text).toContain(`/dashboard/projects/${projectId}/batches/${batchId}|`);
  }, 180_000);

  it('posts nothing when every case passes', async () => {
    await runSuite(await suiteOf('All green', [['Opens', PASS], ['Opens again', PASS]]));
    expect(sent).toEqual([]);
  }, 120_000);

  it('a notice that cannot be delivered does not affect the run, and removing the address stops notices', async () => {
    slack.post = async () => {
      throw new Error('Slack answered 500');
    };
    const suiteId = await suiteOf('Unlucky', [['Finds the button', FAIL]]);
    const batchId = await runSuite(suiteId);
    const { counts } = await json<{ counts: { failed: number } }>(await api(`/projects/${projectId}/run-batches/${batchId}`, token));
    expect(counts.failed).toBe(1); // the run finished normally
    slack.post = async (url, text) => {
      sent.push({ url, text });
    };

    expect(await json(await api(path('/slack'), token, 'DELETE'))).toEqual({ slack: { configured: false } });
    await runSuite(suiteId);
    expect(sent).toEqual([]);
  }, 240_000);
});
