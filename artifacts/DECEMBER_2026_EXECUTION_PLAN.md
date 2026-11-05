# December 2026 Execution Plan: Ticket Backlog

Phases and dates: [docs/DECEMBER_2026_ROADMAP.md](../docs/DECEMBER_2026_ROADMAP.md). Findings referenced by ID
(S1–S6 etc.): [docs/CURRENT_STATE_AUDIT.md](../docs/CURRENT_STATE_AUDIT.md). Status lives in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). All tickets are P0 unless marked.
Complexity: S ≤ 0.5 day, M 1–2 days.

| ID | Problem → root cause | Change (key files) | Depends | Acceptance / tests | Size |
|---|---|---|---|---|---|
| B-0 | Unknown baseline | Run type-check, lint, test, build, db reset, health, browsers | — | Recorded in audit | S |
| SEC-1 | Self-escalation to admin; demo cascade-wipe → table-wide default grants on `profiles` | Mig 22: revoke INSERT/UPDATE/DELETE, grant UPDATE(full_name, avatar_url) | — | `security.int.test.ts` | S |
| SEC-2 | Optimize IDOR → case looked up by ID only with the service-role client | `ai.routes.ts`: `test_suites!inner` scope + Zod params | — | `security.int.test.ts` | S |
| CON-1 | 4 divergent step shapes, no runtime contract | Zod in `packages/shared-types`: action enum, `TestCaseStepSchema` with per-action refinements, `GeneratedTestCaseSchema`, socket event schemas; delete local copies (API route, runner, AI engine, run-detail UI) | — | Schema unit tests; invalid steps → field-level 400 | M |
| CON-2 | Existing rows lack `action` | Mig 23 backfill from first verb (unparseable → null, refused by runner, flagged in UI); `test_steps.instruction` column; update 3 seeds | CON-1 | `db reset` clean; all seeded steps validate | S |
| RUN-1 | False positives, silent clicks, leaked timers, unclosed context | Runner: validate → `switch(action)`, no fallback → Playwright default timeouts + run AbortSignal → close context/browser → strict `passed` → awaited callbacks → `status: passed/failed/error` | CON-1 | QA-1 runner tests | M |
| EXE-1 | Duplicate start, silent persistence loss, unreviewed AI execution | `services/run-executor.ts`: conditional-UPDATE claim, checked writes, `completed_at` on every path, bug after steps; delete socket `test:start`; require `test_case_id` | RUN-1 | Concurrent-claim test; injected write failure → `error` | M |
| EXE-2 | Stuck `running` after restart | Boot reaper, SIGTERM handler, limiter fails closed; document single-instance limits | EXE-1 | Kill mid-run → `error`, not stuck | S |
| EXE-3 | Public screenshots, base64 over socket | Mig: private bucket, drop anon policy; store path; signed URLs in GET run and step events | EXE-1 | Anon fetch denied; owner sees images | S |
| UI-1 | Refresh mid-run shows fake replay; no authoritative refetch | `run-detail-client.tsx`: live for pending+running, refetch on join/reconnect/complete, upsert by step_number, label replay | EXE-1 | E2E refresh-mid-run | M |
| SEC-3 | SSRF via base_url / navigate / recording | Runner `assertAllowedTarget` + `context.route` guard; `ALLOW_PRIVATE_TARGETS` (dev on, prod off); recording uses stored URL | RUN-1 | file:, 169.254.169.254, loopback (prod) blocked | M |
| AI-1 | Unvalidated output, hangs, 500s | Schema validation, `AbortSignal.timeout(60s)`, 401/429 mapping, provider/model/duration metadata | CON-1 | Mocked-fetch unit tests | M |
| AI-2 | No review; orphan suites | `/generate` returns drafts; panel preview/edit/delete/approve via existing test-case POST; optimize returns a draft | AI-1, UI-2 | Nothing persists before Approve | M |
| AI-3 | Demo needs a paid key; demo AI faked in UI | `local-demo` provider (deterministic fixtures for demo-app test IDs), labelled "Local demo, not AI" | DEMO-1 | Generates with no key | S |
| UI-2 | Free-text-only editor; no per-case edit/delete; no bugs list | `step-editor.tsx` (shared schema), case edit/delete, project bugs list | CON-1 | Manual case authored + run | M |
| DEMO-1 | Seeds target non-runnable example.com | `apps/demo-app`: static HTML + zero-dependency `node server.mjs` :4100 (login, register/validation, dashboard, CRUD, checkout, error page, `data-testid`s) | — | Seeded cases pass against it | S |
| DX-1 | Wrong/missing env names, unused required vars | Fix `.env.example`; per-app examples; `DATABASE_URL`/`JWT_SECRET` optional; hex check on `ENCRYPTION_KEY` | — | API boots from examples + setup | S |
| DX-2 | No one-command setup | `scripts/bootstrap.mjs` (`pnpm bootstrap`; `pnpm setup` is a pnpm built-in) + `scripts/doctor.mjs`; `db:*`, `test:e2e`; `dev` includes demo-app | DX-1, DEMO-1 | Clean clone on Windows + Linux | M |
| QA-1 | No runner/AI/executor tests | Vitest per package | RUN-1, AI-1, EXE-1 | `pnpm test` green | M |
| QA-2 | No RLS/cross-user verification | Extend `apps/api/src/__tests__/integration` (started with `security.int.test.ts`) | EXE-3 | `pnpm --filter @qaforge/api test:integration` green | M |
| QA-3 | No app E2E | Playwright Test `e2e/`: golden path, failing case → bug, refresh mid-run | UI-1, AI-2, AI-3, DEMO-1 | `pnpm test:e2e` green locally + CI | M |
| CI-1 | CI lacks lint/DB/E2E | Lint step; Supabase job → integration; E2E job; no real AI keys | QA-2, QA-3 | All jobs green | S |
| DOC-1 | Docs don't match code | `docs/*` + living docs; README/setup guide rewritten to real commands; GOAL.md → RELEASE_CHECKLIST | ongoing | Every documented command runs as written | M |
| P1 | — | Event sequence numbers, failure classification, stats, browser matrix, AI model fallback | core done | — | — |
