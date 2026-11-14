# Current State Audit (5 Nov 2026)

Method: direct source reads of the execution core, plus three read-only audit passes (DB/security, AI/tests/CI,
frontend). The critical findings were verified live against local Supabase. Branch `demo-prod-ready-2026-06-13`,
tree was clean at start. Untracked secret files (`extracted_keys.txt`, `supabase_keys.txt`, …) are gitignored and
were never committed.

## Baseline (actual output, 5 Nov 2026)
| Check | Result |
|---|---|
| `pnpm type-check` | ✅ 7/7 |
| `pnpm lint` | ❌ 5 errors in `apps/api` (unused vars), 22 warnings → **fixed same day: 0 errors, 21 warnings** |
| `pnpm test` | ✅ 32/32 (apps/api only; no other package has tests) |
| `pnpm build` | ✅ 7/7 |
| `supabase start` + `supabase db reset` | ✅ 21 migrations + seed apply cleanly (Docker Desktop had to be started first) |
| `GET /api/health` | ✅ `{status:ok, version:2.0.0-mvp}` |
| Playwright browsers | ✅ installed locally (chromium-1228); **no repo step installs them** |
| Web lint | ✅ but the Next.js ESLint plugin is not configured; `next lint` is deprecated |

## Security
| ID | Severity | Finding | Status |
|---|---|---|---|
| S1 | CRITICAL | Any user can PATCH `profiles.role='admin'` via PostgREST, after which `is_admin()` exposes all data. **Reproduced locally: bob saw 0 → 3 foreign projects** | Fixed (mig 22), verified + integration test |
| S2 | HIGH | Demo user can DELETE its profile, cascading away all demo data | Fixed (mig 22), verified |
| S3 | HIGH | `POST /ai/optimize/:caseId` reads/overwrites any user's case (IDOR) | Fixed, verified (404) + test |
| S4 | HIGH | `test-artifacts` bucket public with anonymous SELECT | Open (EXE-3) |
| S5 | HIGH | No SSRF guard: `base_url` accepts file:/loopback/metadata; navigate steps unchecked; recording uses a raw socket URL | Open (SEC-3) |
| S6 | MED | `test_runs` RLS doesn't tie case to project; `bugs.assigned_to` NO ACTION; concurrency limiter fails open on a Redis error | Open |
| — | OK | AES-256-GCM with a random 12-byte IV and auth tag; keys are never returned in plaintext. Gap: `ENCRYPTION_KEY` hex not validated | — |

## Execution (release blockers)
- **False positives:** zero steps or a failed initial navigation report PASSED (`runner index.ts:304`).
- Unknown instructions silently click; "press Enter" is clicked; missing selector/value gives a no-op "pass".
- Step timeout doesn't cancel the action; the context is never closed; infra vs test failure is not distinguished.
- `onStepComplete` not awaited → persistence races final status and bug creation; DB/storage errors ignored.
- Duplicate-start race (HTTP fire-and-forget + socket `test:start`; non-atomic pending → running).
- No recovery for runs stuck in `running` after a restart; no SIGTERM handling.
- UI: a `running` run after refresh shows a **scripted replay** instead of live state; no refetch on
  reconnect or complete; events for unseen steps are dropped.

## AI
Auto-saves generated cases with no review; creates the suite before the AI call (orphan on failure); output is cast
with `as` and never validated; no timeouts or retries; provider 401/429 surface as 500; no local demo provider
(demo generation is faked in the browser).

## Contracts
The step Zod schema lives only in `apps/api/src/routes/test-cases.routes.ts`. shared-types has no Zod; its
WebSocket event types are unused. The UI, runner and AI each redefine step shapes. The manual editor is free text only.

## Setup / docs
Env example uses the wrong web key name (`…_ANON_KEY` vs `…_PUBLISHABLE_KEY`) and misses API vars; `DATABASE_URL`
and `JWT_SECRET` are required but never read; the README clone URL is a placeholder; the `.env` example contains
`$(openssl …)`; migration counts in the docs are wrong; seeds target `*.example.com` (not runnable); there is no
setup script and no demo target app.

## Quality
Tests exist only in `apps/api`. No runner, AI, route, RLS or E2E tests. CI has no lint, DB or E2E job.
`export-engine` and `integrations` are unused stubs.

## Retain
Monorepo layout, Supabase + RLS design, Zod env validation, AES-GCM key storage, socket ownership check on
`test:join`, demo guard, structured JSON errors, helmet/CORS/rate limits, concurrency limiter design.
