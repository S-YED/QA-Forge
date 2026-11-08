# December 2026 Release Checklist (active goal)

This replaces GOAL.md's completed demo gates as the active goal. Tick an item **only** with evidence (command
output or test name) recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Bar for "runnable":
[docs/STRANGER_RUN.md](../docs/STRANGER_RUN.md).

## Installation
- [x] Fresh clone works (Windows + Linux) — Linux by CI run 42462120572; Windows 11 clean clone 8 Nov: bootstrap, unit, integration 21/21, E2E 4/4 (REL-1)
- [x] Prerequisites documented with versions (Node 20+, pnpm 9.15.4, Docker; Supabase CLI ships as a dev dependency) — README + setup guide (DOC-1)
- [x] Dependency installation works (`pnpm install --frozen-lockfile`, CI)
- [x] `pnpm bootstrap` works and is safe to rerun (rerun verified 8 Nov; fresh clone under REL-1)
- [x] Local Supabase starts — `npx supabase start`, 8 Nov 2026 (after a Windows reboot; Docker/WSL hang noted in KNOWN_ISSUES)
- [x] All migrations apply cleanly — `supabase db reset`, 23 migrations, 5 Nov 2026; migration 24 via `migration up`, 8 Nov
- [ ] Demo seed data loads **and targets the local demo app**
- [x] Environment configuration validated (`pnpm check-setup`; `pnpm doctor` is a pnpm built-in)
- [x] Playwright browsers installed by the setup (bootstrap)
- [x] No undocumented manual steps — Windows clean clone needed only `pnpm bootstrap` (REL-1, 8 Nov)

## Product functionality
- [x] Registration and login (`e2e/registration.spec.ts`: sign up from the sign-in page, then sign in again; local, 8 Nov) · [x] Projects · [x] Test suites (browser, 8 Nov) · [x] Manual test cases (structured editor: create, edit, delete; browser 8 Nov)
- [ ] AI generation with configured providers · [x] Local demo mode without paid keys (`demo-flow.int.test.ts`, 8 Nov)
- [x] Generated cases reviewed and approved before save (AI-2: integration + browser, 8 Nov)
- [x] Runs created · [x] Real browser executes steps (`run-lifecycle.int.test.ts`) · [x] Live progress visible (browser, 8 Nov)
- [x] Screenshots saved (private) and retrievable (EXE-3 integration, 8 Nov) · [x] Failed / passed steps recorded correctly (`run-lifecycle.int.test.ts`)
- [x] Final status correct (passed/failed/error, `run-lifecycle.int.test.ts`) · [x] Failed runs produce bugs (and errors don't) · [x] Run history survives refresh (refresh mid-run, browser, 8 Nov)

## Reliability
- [x] No false-positive passing runs (empty/invalid/unreachable/callback failure → `error`; `runner.test.ts`) · [x] No duplicate execution (concurrent-claim test) · [x] No permanently stuck `running` (EXE-2 integration, 8 Nov)
- [x] Browser resources cleaned up — runner test `cleanup`: after passed, failed, timed-out, unreachable, refused, persistence-error and cancelled runs no Chromium child process or SSRF-guard proxy is left (helpers proven to detect a live one), 8 Nov · [x] Persistence failures reported (upload failure → `error`) · [x] Socket reconnection recovers DB state (ack then reload; refresh mid-run, 8 Nov)
- [x] Errors logged and diagnosable — every run end logs `run:complete` with run id, user id, status, duration and the reason (warn level for `error`, so it reaches production logs); request errors log path, method and user id. Fixed: development logs printed structured events as "[object Object]" (now readable JSON, `logger.test.ts`). Checked live 8 Nov with a run against an unreachable URL

## Security
- [x] Cross-user access test matrix passes — `cross-user.int.test.ts` (27 routes + AI key + sockets) with `security.int.test.ts` and `s6.int.test.ts` (QA-2, 8 Nov)
- [ ] RLS policies verified (profiles, test_runs case scoping and storage covered; full matrix pending) · [x] Profile role self-escalation blocked — `security.int.test.ts` (local)
- [ ] Fixes applied to production (mig 22 + API redeploy) — approved 8 Nov; waiting on the Railway service (gone) and the DB password for `db push`
- [x] API keys encrypted (hex key validated) — `src/utils/encryption.test.ts`, `env-example.test.ts` (8 Nov 2026) · [x] Service-role key backend-only — the key value appears in no file of the web build (`apps/web/.next`) or web env files; the only "service_role" strings there are supabase-js doc comments (8 Nov)
- [x] Storage private (local; cloud after migration 24) · [x] WebSocket authorization verified — no/forged token refused at connect; cross-user `test:join` refused (`cross-user.int.test.ts`, 8 Nov) · [x] Browser network restrictions tested (runner SSRF tests, real Chromium)
- [x] No secrets committed (scan) — pattern scan of tracked files and full history (JWT, sb_secret, sk-/sk-ant-/sk-or-v1, AIza, private keys): only a fake test value; no .env or key file ever added; local key files gitignored (8 Nov; gitleaks not installed)

## Engineering
- [x] Build passes — 7/7, 5 Nov 2026 · [x] Type check passes — 7/7 · [x] Lint passes (0 errors) — 7/7
- [x] Unit tests pass — api 85/85, runner 13/13 (8 Nov 2026; CI green) · [x] Integration tests in CI · [x] E2E tests pass (local, `pnpm test:e2e` 4/4, 8 Nov) · [x] CI covers all of the above (type-check, lint, build, unit, integration, E2E; green 8 Nov)
- [x] README matches actual commands (DOC-1, 8 Nov) · [x] Setup docs accurate (DOC-1, 8 Nov) · [ ] Release notes
