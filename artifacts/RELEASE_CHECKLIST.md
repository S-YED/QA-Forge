# December 2026 Release Checklist (active goal)

This replaces GOAL.md's completed demo gates as the active goal. Tick an item **only** with evidence (command
output or test name) recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Bar for "runnable":
[docs/STRANGER_RUN.md](../docs/STRANGER_RUN.md).

## Installation
- [x] Fresh clone works (Windows + Linux) — Linux by CI run 42462120572; Windows 11 clean clone 8 Nov: bootstrap, unit, integration 21/21, E2E 4/4 (REL-1)
- [ ] Prerequisites documented with versions (Node, pnpm, Docker, Supabase CLI)
- [x] Dependency installation works (`pnpm install --frozen-lockfile`, CI)
- [x] `pnpm bootstrap` works and is safe to rerun (rerun verified 8 Nov; fresh clone under REL-1)
- [x] Local Supabase starts — `npx supabase start`, 8 Nov 2026 (after a Windows reboot; Docker/WSL hang noted in KNOWN_ISSUES)
- [x] All migrations apply cleanly — `supabase db reset`, 23 migrations, 5 Nov 2026; migration 24 via `migration up`, 8 Nov
- [ ] Demo seed data loads **and targets the local demo app**
- [x] Environment configuration validated (`pnpm check-setup`; `pnpm doctor` is a pnpm built-in)
- [x] Playwright browsers installed by the setup (bootstrap)
- [ ] No undocumented manual steps

## Product functionality
- [ ] Registration and login · [x] Projects · [x] Test suites (browser, 8 Nov) · [x] Manual test cases (structured editor: create, edit, delete; browser 8 Nov)
- [ ] AI generation with configured providers · [x] Local demo mode without paid keys (`demo-flow.int.test.ts`, 8 Nov)
- [x] Generated cases reviewed and approved before save (AI-2: integration + browser, 8 Nov)
- [x] Runs created · [x] Real browser executes steps (`run-lifecycle.int.test.ts`) · [x] Live progress visible (browser, 8 Nov)
- [x] Screenshots saved (private) and retrievable (EXE-3 integration, 8 Nov) · [x] Failed / passed steps recorded correctly (`run-lifecycle.int.test.ts`)
- [x] Final status correct (passed/failed/error, `run-lifecycle.int.test.ts`) · [x] Failed runs produce bugs (and errors don't) · [x] Run history survives refresh (refresh mid-run, browser, 8 Nov)

## Reliability
- [x] No false-positive passing runs (empty/invalid/unreachable/callback failure → `error`; `runner.test.ts`) · [x] No duplicate execution (concurrent-claim test) · [x] No permanently stuck `running` (EXE-2 integration, 8 Nov)
- [ ] Browser resources cleaned up · [x] Persistence failures reported (upload failure → `error`) · [x] Socket reconnection recovers DB state (ack then reload; refresh mid-run, 8 Nov)
- [ ] Errors logged and diagnosable

## Security
- [ ] Cross-user access test matrix passes (partial: profiles + optimize — `security.int.test.ts`)
- [ ] RLS policies verified (profiles, test_runs case scoping and storage covered; full matrix pending) · [x] Profile role self-escalation blocked — `security.int.test.ts` (local)
- [ ] Fixes applied to production (mig 22 + API redeploy) — approved 8 Nov; waiting on the Railway service (gone) and the DB password for `db push`
- [x] API keys encrypted (hex key validated) — `src/utils/encryption.test.ts`, `env-example.test.ts` (8 Nov 2026) · [ ] Service-role key backend-only
- [x] Storage private (local; cloud after migration 24) · [ ] WebSocket authorization verified · [x] Browser network restrictions tested (runner SSRF tests, real Chromium)
- [ ] No secrets committed (scan)

## Engineering
- [x] Build passes — 7/7, 5 Nov 2026 · [x] Type check passes — 7/7 · [x] Lint passes (0 errors) — 7/7
- [x] Unit tests pass — api 85/85, runner 13/13 (8 Nov 2026; CI green) · [x] Integration tests in CI · [x] E2E tests pass (local, `pnpm test:e2e` 4/4, 8 Nov) · [x] CI covers all of the above (type-check, lint, build, unit, integration, E2E; green 8 Nov)
- [x] README matches actual commands (DOC-1, 8 Nov) · [x] Setup docs accurate (DOC-1, 8 Nov) · [ ] Release notes
