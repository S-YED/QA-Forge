# December 2026 Release Checklist (active goal)

This replaces GOAL.md's completed demo gates as the active goal. Tick an item **only** with evidence (command
output or test name) recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Bar for "runnable":
[docs/STRANGER_RUN.md](../docs/STRANGER_RUN.md).

## Installation
- [ ] Fresh clone works (Windows + Linux)
- [ ] Prerequisites documented with versions (Node, pnpm, Docker, Supabase CLI)
- [ ] Dependency installation works (`pnpm install --frozen-lockfile`)
- [ ] `pnpm bootstrap` works and is safe to rerun
- [ ] Local Supabase starts
- [x] All migrations apply cleanly — `supabase db reset`, 23 migrations, 5 Nov 2026
- [ ] Demo seed data loads **and targets the local demo app**
- [ ] Environment configuration validated (`pnpm doctor`)
- [ ] Playwright browsers installed by the setup
- [ ] No undocumented manual steps

## Product functionality
- [ ] Registration and login · [ ] Projects · [ ] Test suites · [ ] Manual test cases (structured editor)
- [ ] AI generation with configured providers · [ ] Local demo mode without paid keys
- [ ] Generated cases reviewed and approved before save
- [x] Runs created · [x] Real browser executes steps (`run-lifecycle.int.test.ts`) · [ ] Live progress visible
- [ ] Screenshots saved (private) and retrievable · [x] Failed / passed steps recorded correctly (`run-lifecycle.int.test.ts`)
- [x] Final status correct (passed/failed/error, `run-lifecycle.int.test.ts`) · [x] Failed runs produce bugs (and errors don't) · [ ] Run history survives refresh

## Reliability
- [x] No false-positive passing runs (empty/invalid/unreachable/callback failure → `error`; `runner.test.ts`) · [x] No duplicate execution (concurrent-claim test) · [ ] No permanently stuck `running`
- [ ] Browser resources cleaned up · [x] Persistence failures reported (upload failure → `error`) · [ ] Socket reconnection recovers DB state
- [ ] Errors logged and diagnosable

## Security
- [ ] Cross-user access test matrix passes (partial: profiles + optimize — `security.int.test.ts`)
- [ ] RLS policies verified · [x] Profile role self-escalation blocked — `security.int.test.ts` (local)
- [ ] Fixes applied to production (mig 22 + API redeploy) — **owner approval required**
- [x] API keys encrypted (hex key validated) — `encryption.test.ts`, `env-example.test.ts` (8 Nov 2026) · [ ] Service-role key backend-only
- [ ] Storage private · [ ] WebSocket authorization verified · [x] Browser network restrictions tested (runner SSRF tests, real Chromium)
- [ ] No secrets committed (scan)

## Engineering
- [x] Build passes — 7/7, 5 Nov 2026 · [x] Type check passes — 7/7 · [x] Lint passes (0 errors) — 7/7
- [x] Unit tests pass — api 88/88, runner 13/13 (8 Nov 2026) · [ ] Integration tests in CI · [ ] E2E tests pass · [ ] CI covers all of the above
- [ ] README matches actual commands · [ ] Setup docs accurate · [ ] Release notes
