# Implementation Status

Statuses: Not started · In progress · Implemented, not verified · **Verified** (evidence required) · Blocked · Deferred.
Backlog definitions: [DECEMBER_2026_EXECUTION_PLAN.md](DECEMBER_2026_EXECUTION_PLAN.md).

_Last updated: 5 Nov 2026_

| ID | Status | Evidence / notes |
|---|---|---|
| B-0 | **Verified** | Baseline table in `docs/CURRENT_STATE_AUDIT.md` (type-check 7/7, lint 5 errors → fixed, test 32/32, build 7/7, db reset 21 migrations, health OK) |
| SEC-1 | **Verified (local)** | Repro before fix: bob PATCH `role=admin` → visible projects 0 → 3. After mig 22: PATCH role/is_demo → 42501, projects stay 0, `full_name` PATCH → 200, demo DELETE profile → 42501 with 3 projects intact. Mutation check: re-granting UPDATE/DELETE makes 2 tests fail; reset → 5/5 pass. **Not yet applied to Supabase Cloud. Needs owner approval** |
| SEC-2 | **Verified (local)** | Cross-user optimize → 404 and alice's case unchanged; own case → passes ownership (stops at "no AI key" 400); bad UUID → 400. GitNexus impact on `ai.routes.ts`: LOW, 1 direct dependent (`app.ts`). **Not yet deployed to Railway** |
| Lint errors | **Verified** | 5 unused-identifier errors removed (`ai.routes.ts`, `test.handler.ts`, `recording.handler.ts`, 2 tests) → `pnpm lint` 7/7, 0 errors |
| DOC-1 | In progress | `docs/` discovery set + living docs created. README/setup guide rewrite pending (with DX-1/DX-2) |
| CON-1 | **Verified** (API + AI); web editor implemented, **not yet browser-checked** | `packages/shared-types/src/steps.ts`: `STEP_ACTIONS`, `STEP_ACTION_FIELDS`, `TestCaseStepSchema` (per-action selector/value rules, blank = missing), `TestCaseStepsSchema`, `GeneratedTestCaseSchema`. Consumers: `test-cases.routes.ts` (local schema deleted), `recorded-sessions.routes.ts` (click/type/select → click/fill/select), ai-engine (prompt built from the table; output validated, invalid cases dropped into `rejected`), web manual editor (action select + selector/value inputs). Tests: `step-contract.test.ts` 33/33 (mutation: removing the value rule → 7 fail); integration `CON-1 …` legacy step → 400 with `details.steps.0.action`, fill w/o value → 400, valid → 201. GitNexus: `TestCaseStep` LOW; `generateTestCases` **HIGH** (8 dependents, signature unchanged, covered by mocked-provider test); detect-changes risk high (AI flows), expected |
| CON-2 | **Verified (local)** | Migration 23 backfills `action` from the first verb of `instruction` (unmappable → left without `action` = needs fix; idempotent), turns bare-verb seed instructions into readable descriptions, and adds `test_steps.instruction`. Applied with `supabase migration up` to legacy local data: steps missing `action` 43 → 0, all 8 cases pass `TestCaseStepsSchema`. Edge cases checked in psql: URL assert → `assert_url`, "Enter …" → `fill`, text assert → `assert_text`, unmappable → untouched, existing `action` → untouched. Seeds `seed.sql` / `seed-demo-realism.sql` / `seed-prod.sql` converted (105 steps; 22 arrays, 0 invalid). `db reset` (23 migrations) → 0/43 missing; integration 6/6. **Not applied to Supabase Cloud (owner approval)** |
| RUN-1 | **Verified** | `packages/playwright-runner/src/index.ts` rewritten: validates steps with `TestCaseStepsSchema` before launch; `switch(action)` with no fallback (exhaustive `never`); context default/navigation timeouts replace the leaking `Promise.race`; callbacks awaited, and a throwing callback ends the run as `error`; `AbortSignal` cancels; context and browser closed in `finally`; `RunResult.status` is `passed`/`failed`/`error` and passes only when every step ran and passed; navigate is http(s)-only. `test.handler` uses `result.status`, files bugs only for `failed`, persists `test_steps.instruction`. Tests: `packages/playwright-runner/test/runner.test.ts` 10/10 on real Chromium (all 11 actions, empty, legacy/unknown, unreachable base, failed+skipped, timeout, strict selector, file: refused, callback throw, cancel); mutation (drop the `failed` return) → 4 fail. End to end through the API: `run-lifecycle.int.test.ts` 3/3 (passed + 4 steps persisted with screenshots, no bug; failed → `[failed, skipped]` + 1 bug; unreachable → `error`, no bug). GitNexus: `runTest` **HIGH** (single caller `test.handler`, adjusted in the same change); `executeTestOrchestration` LOW. CI installs Chromium before `pnpm test`. Web run detail shows `instruction` (falls back to `action`). **Not browser-checked yet** |
| EXE-1 … CI-1 | Not started | — |
| Recording/replay, exports, integrations, vector context | Deferred | Charter §13 |

## Verification commands (5 Nov 2026, all green)
```
pnpm type-check                                   # 7/7
pnpm lint                                         # 7/7, 0 errors, 21 warnings (no-explicit-any)
pnpm test                                         # api 65/65, runner 10/10 (real Chromium)
pnpm build                                        # 7/7
supabase db reset                                 # 23 migrations + seed
pnpm --filter @qaforge/api test:integration       # 9/9 (needs local Supabase + Chromium)
```
