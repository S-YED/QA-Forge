# Test Execution Flow

Two sections: **Current** (what the code does on 5 Nov 2026, with defects) and **Target** (what tickets
EXE-1/2/3, RUN-1 and UI-1 implement). Update "Current" as tickets land.

## Current
1. UI `test-suites-tab.tsx` → `POST /api/projects/:pid/test-runs {test_case_id, mode:'ai_driven', browser}`.
2. `test-runs.routes.ts` checks project ownership and that the case belongs to the project, inserts a
   `test_runs` row with `status='pending'`, then **fire-and-forgets** `executeTestOrchestration` and returns 201.
3. UI navigates to `/dashboard/projects/:pid/runs/:rid`. `run-detail-client.tsx` GETs the run; **only if
   `pending`** does it open a socket and emit `test:join`.
4. `executeTestOrchestration` (`websocket/handlers/test.handler.ts`):
   acquire concurrency slot → re-read run → `status !== 'pending'` check → read `projects.base_url` →
   steps from the test case (or, if `nl_input`, **generate with AI at run time and execute unreviewed**) →
   `update status='running'` (separate statement: **not atomic**) → `runTest()`.
5. Runner (`packages/playwright-runner/src/index.ts`): launch browser → `goto(baseUrl)` → for each step,
   regex-classify the free-text `instruction` → run the action → screenshot. The first failure marks the rest
   `skipped`.
   `onStepComplete` (**not awaited**) inserts `test_steps`, uploads the PNG to the public `test-artifacts` bucket and
   sets `screenshot_url`.
6. Finalize: `status = passed|failed` from `results.every(passed)`. **An empty results array counts as passed**,
   so a failed initial navigation with zero steps reports PASSED. On failure a `bugs` row is inserted.
7. A second, competing start path exists: socket `test:start` (unused by the UI, still callable).

### Socket events (server → client), payloads always carry `test_run_id`
| Event | Payload | Notes |
|---|---|---|
| `test:status` | `message` | AI generation progress |
| `test:running` | `started_at` | |
| `test:step:start` | `step_number, action` | |
| `test:step:complete` | `step_number, status, screenshot_url?, error_message?, duration_ms` | |
| `test:screenshot` | `step_number, screenshot_base64` | full PNG over the socket |
| `test:complete` | `status, duration_ms, error_message?` | |
| `test:bug_created` | `bug_id, bug_title` | |
| `test:error` / `test:unauthorized` | `message` | |
Client → server: `test:join {test_run_id}` (ownership-checked), `test:start` (to be removed).

### Known defects
- False PASSED for zero steps / failed navigation.
- Unknown instructions silently click; "press Enter" is treated as a click.
- Missing selector/value results in a no-op "passed" step.
- Timeouts don't cancel the action; the context isn't closed.
- Duplicate-start race; persistence errors ignored.
- Runs stuck in `running` after a restart.
- A `running` run on page refresh plays a scripted replay instead of live progress.
- Early events are missed; no refetch.

## Target (December)
1. POST validates ownership, the case and the browser; requires `test_case_id`; inserts `pending`; returns 201.
2. Executor (`apps/api/src/services/run-executor.ts`) claims the run atomically:
   `UPDATE test_runs SET status='running', started_at=now() WHERE id=$1 AND status='pending' RETURNING *`.
   Zero rows means already claimed, so it is a no-op. This is the only start path.
3. Steps are validated with the shared Zod schema (explicit `action` enum). An invalid case becomes run `error`
   with field errors and no browser launch.
4. Runner: target-URL guard (SSRF) → launch → `goto(baseUrl)` → `switch(action)` with Playwright default
   timeouts and a whole-run AbortSignal → screenshot → **awaited** `onStepComplete`. Browser and context are
   closed in `finally`.
   `passed` only if steps > 0, every step ran and passed, and there was no run-level error. Infra and navigation
   problems yield `error`, not `failed`.
5. Each step insert and private-storage upload is checked. Any persistence failure makes the run `error` with a
   `persistence:` message.
6. Final status with `completed_at` and `duration_ms` on **every** terminal path. Then a bug on `failed`.
   Then the `test:complete` event.
7. UI: connects for `pending` and `running`; on join, reconnect and complete it **refetches** the run from the API
   (authoritative) and upserts events by `step_number`. Screenshots come from signed URLs.
8. Boot reaper marks stale `pending/running` runs `error: interrupted by server restart`. SIGTERM stops claims and
   closes browsers.
