# Test Execution Flow

What happens from clicking **Run** to a finished run with evidence. This is the delivered behaviour
(tickets RUN-1, EXE-1/2/3, SEC-3, UI-1, S6), covered by the runner unit tests, the integration tests in
`apps/api/src/__tests__/integration/` and the E2E suite in `e2e/`.

## Flow
1. UI (`test-suites-tab.tsx`) calls `POST /api/projects/:pid/test-runs {test_case_id, browser}`.
2. `test-runs.routes.ts` checks that the project is the caller's and the case belongs to it (the database enforces
   the same through RLS, migration 25), validates the base URL scheme, inserts a `pending` row, starts the
   executor and returns 201. This is the only start path; the old socket `test:start` is gone.
3. The executor (`apps/api/src/services/run-executor.ts`) claims the run atomically:
   `UPDATE test_runs SET status='running' WHERE id=$1 AND status='pending' RETURNING *`. Zero rows means another
   call claimed it, and this call does nothing.
4. Steps are validated with the shared Zod schema (`@qaforge/shared-types`, explicit `action` enum). An invalid
   case ends as `error` with field messages and no browser launch.
5. Runner (`packages/playwright-runner`): SSRF guard on the base URL and on every request the page makes (local
   forward proxy; http/https only; private, loopback, link-local and metadata addresses refused unless listed in
   `ALLOW_PRIVATE_HOSTS`) → launch Chromium → `goto(baseUrl)` → one explicit handler per action with Playwright
   timeouts and a whole-run abort signal → screenshot → **awaited** step callback. Context and browser close in
   `finally`. The first failing step marks the rest `skipped`.
6. Each step row and its screenshot upload are checked. Screenshots go to the private `test-artifacts` bucket; the
   row stores the path `screenshots/<run>/step_<n>.png`. A persistence failure ends the run as `error` with a
   `persistence:` message.
7. Outcome: `passed` only when there is at least one step, every step ran and passed, and there was no run-level
   error. Navigation, guard and infrastructure problems are `error`; a failing assertion is `failed`. Every
   terminal path sets `completed_at` and `duration_ms`. A `failed` run then files a bug with the failing step's
   screenshot path, and `test:complete` is emitted last.
8. Recovery: on boot the API marks runs left `pending`/`running` by a previous process as `error` (interrupted).
   On SIGTERM/SIGINT it stops accepting connections, cancels in-flight runs and waits up to 15 s for them to
   record `error`. This assumes a single API instance (see `artifacts/TECHNICAL_DECISIONS.md`, TD-3).

## Reading results
- `GET /api/projects/:pid/test-runs/:rid` returns the run and its steps, with each screenshot path replaced by a
  signed URL valid for 1 hour. Bug endpoints sign bug screenshots the same way. Anonymous access to the bucket is
  refused.
- The run page (`run-detail-client.tsx`) goes live for `pending` and `running` runs: it joins the socket room,
  waits for the server's acknowledgement, then reloads the run from the API and merges events by `step_number`, so
  nothing emitted before the join is lost. It reloads again on reconnect and on completion. Finished runs show as
  **Replay**.

## Socket events
Server → client, every payload carries `test_run_id`:

| Event | Payload |
|---|---|
| `test:running` | `started_at` |
| `test:step:start` | `step_number, action` (the step's instruction text) |
| `test:step:complete` | `step_number, instruction, status, screenshot_url?` (signed), `error_message?, duration_ms` |
| `test:bug_created` | `bug_id, bug_title` |
| `test:complete` | `status, duration_ms, error_message?` |
| `test:error` / `test:unauthorized` | `message` |

Client → server: `test:join {test_run_id}` with an acknowledgement callback. The server checks ownership, joins
the room, then acks `{ok: true}` (or `{ok: false}` when the run isn't yours).
