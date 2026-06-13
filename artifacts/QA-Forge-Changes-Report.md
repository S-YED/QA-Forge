<!-- /autoplan restore point: ~/.gstack/projects/S-YED-QA-Forge/main-autoplan-restore-20260612-120733.md -->
# QA Forge — Comprehensive Implementation Walkthrough & Status Report

This document outlines the **Implementation Plan**, the **Changes Completed** (Tasks T1–T9, including design/security updates), and the **Changes Remaining** (Phase 5 deployment and launch tasks) for QA Forge's public release.

---

## 📋 Section 1: Implementation Plan

The goal is to transition QA Forge from an MVP-2 codebase into a **publicly deployed, hiring-manager-ready product** with a live demo link.

### 🎯 Scope Checklist

| Capability / Task | Status | Priority | Files Touched |
|---|---|---|---|
| **T1: Server-side Demo Auth** | ✅ Completed | 🔴 Must Ship | `apps/api/src/routes/auth.routes.ts`, `apps/web/app/demo/page.tsx` |
| **T2: Demo User & Seed Data** | ✅ Completed | 🔴 Must Ship | `supabase/seed.sql`, `supabase/migrations/*_demo_account.sql` |
| **T3: Guards & Concurrency** | ✅ Completed | 🔴 Must Ship | `apps/api/src/middleware/demo-guard.ts`, `concurrency-limiter.ts` |
| **T4: Playwright Exporter** | ✅ Completed | 🟡 Should Ship | `apps/web/components/projects/run-detail-client.tsx` |
| **T5: Live Terminal UI** | ✅ Completed | 🟡 Should Ship | `apps/web/components/projects/run-detail-client.tsx` |
| **T6: Screenshot Filmstrip** | ✅ Completed | 🟡 Should Ship | `apps/web/components/projects/run-detail-client.tsx` |
| **T7: resolveAIKey Helper** | ✅ Completed | 🔴 Must Ship | `apps/api/src/utils/resolve-ai-key.ts` |
| **T8: Vitest & Unit Tests** | ✅ Completed | 🔴 Must Ship | `apps/api/vitest.config.ts`, `apps/api/src/**/__tests__/*.ts` |
| **T9: Profile DB Cache** | ✅ Completed | 🟡 Should Ship | `apps/api/src/middleware/auth.middleware.ts` |
| **D7: Demo Mode Banner** | ✅ Completed | 🔴 Must Ship | `apps/web/components/layout/demo-banner.tsx`, `dashboard-shell.tsx` |
| **Phase 5: Deploy API to Railway** | ⏳ Remaining | 🔴 Must Ship | Railway Config / Nixpacks / Environment variables |
| **Phase 5: Deploy Web to Vercel** | ⏳ Remaining | 🔴 Must Ship | Vercel Config / Monorepo setup / Env variables |
| **Phase 5: DB Migrations** | ⏳ Remaining | 🔴 Must Ship | Push 19 migrations to Supabase Cloud |

(Full report body preserved — see conversation. This file is the autoplan working plan / restore point.)

---

# 🔍 /autoplan REVIEW REPORT (2026-06-12)

**Reviewers:** Claude (code-grounded, verified against repo) + 2 independent Claude subagents (eng/security, product/DX). Codex unavailable on this Windows host → dual-voice degraded to subagent-only. Every finding below was verified against actual source, not the report's ✅ claims.

**Verdict: NOT ready to launch as written.** The completed-work claims are structurally real (files exist, 22 tests pass) but several "✅ Completed" tasks are non-functional as deployed, and the Phase 5 deploy plan contains a data-loss footgun. ~8 must-fix items before a public demo.

## Consensus table (✓ = both independent voices + my code read agree)

| # | Finding | Sev | Consensus | Evidence |
|---|---------|-----|-----------|----------|
| C1 | Demo RLS policies are PERMISSIVE (no `AS RESTRICTIVE`) → they OR with ownership policies and **do not block demo writes** | CRITICAL | ✓✓✓ | migration 19:31-98 vs 000004:37-43 |
| C2 | Demo write-protection bypassable via direct Supabase PostgREST (anon key public, demo pw in git); `demoGuard` only guards Express, not Supabase | CRITICAL | ✓✓✓ | supabase.ts:4-8, demo-guard.ts:30, auth.routes.ts:27 |
| C3 | Phase 5 `supabase db reset --linked` = **drops prod DB**; seed.sql is dev-only AND plants admin accounts (alice, sy3dkm@gmail) with pw `Password123!` | CRITICAL | ✓✓ | seed.sql:6,79-131; report Phase 5 |
| C4 | **seed.sql is dev-only → in prod the demo user & sample data won't exist** → `/api/auth/demo` 500s or lands in empty account. Both voices hit this independently. | CRITICAL | ✓✓ | seed.sql:5-8 |
| H1 | Demo user **cannot start a test run** — `demoGuard` 403s the POST. "Watch tests run live" is impossible for the demo. | HIGH | ✓✓✓ | app.ts:69, test-runs.routes.ts:112, demo-guard.ts:24 |
| H2 | **All 10 seeded runs are terminal (passed/failed); none `pending`** → the live-terminal WebSocket path never fires; demo replays instantly, not live | HIGH | ✓✓ | seed.sql:368-422, run-detail-client.tsx:338 |
| H3 | **Screenshot filmstrip is empty** — no `screenshot_base64`/`_url` seeded on any step → filmstrip dead on arrival | HIGH | ✓✓ | seed.sql:424-479, run-detail-client.tsx:216 |
| H4 | `concurrencyLimiter`, `demoRunLimiter`, `aiLimiter` are **dead code** — defined + unit-tested but never mounted in app.ts/routes. T3's resource protection is unenforced. | HIGH | ✓✓✓ | grep apps/api/src |
| H5 | `releaseSlot` **never called on any path** → if limiter were wired, every run leaks a slot; user locked out after 2 forever | HIGH | ✓✓ | test.handler.ts (no finally) |
| M1 | In-memory state (concurrency map, profile cache, rate-limit store, socket.io rooms) breaks on Railway multi-instance/restart; **live streaming silently fails behind >1 replica** without Redis adapter | MED | ✓✓ | concurrency-limiter.ts:11, socket-server.ts |
| M2 | "Demo data resets daily" copy in 3 places (demo page, banner, landing) — **no reset job exists anywhere** | MED | ✓✓ | demo/page.tsx:85, demo-banner.tsx:55, landing:153 |
| M3 | Playwright export hardcodes `https://example.com` base URL (ignores project base_url); 5 of 10 runs have no steps seeded → empty shells + disabled export | MED | ✓ | run-detail-client.tsx:514 |
| M4 | `/api/auth/demo` unauthenticated + unthrottled → public session minting (compounds C2) | MED | ✓ | app.ts:54, auth.routes.ts:16 |
| L1 | Report's `resolveAIKey` "fallback defaults" claim is false — no env-key fallback; demo has no AI key seeded (moot while demo can't run) | LOW | ✓ | resolve-ai-key.ts |
| L2 | `JWT_SECRET` required by env.ts but never used in code; `DATABASE_URL` required but omitted from the report's inline Railway var list | LOW | ✓ | env.ts:15,19 |

## Cross-phase themes (independently flagged by both voices = high confidence)
- **The production demo will be empty or broken** (C4 + C3): seed data is dev-only; without a safe prod seed, the demo link fails.
- **The demo's entire value prop is structurally absent** (H1 + H2 + H3): the "live AI test execution" wow — terminal stream, filmstrip, auto-bug feed — never fires. A hiring manager sees the *output* of the product, never the product *working*.

# ✅ IMPLEMENTATION (must-fix blockers + scripted live-replay) — 2026-06-12

Decisions: demo direction = **scripted live-replay** (read-only kept); action = **implement must-fix blockers now**. Verified: `vitest run` 22/22 pass; `tsc --noEmit` clean for both `@qaforge/api` and `@qaforge/web`.

| Finding | Fix shipped | Files |
|---------|-------------|-------|
| C1 | All demo-deny RLS policies now `AS RESTRICTIVE`; lockdown extended to all 15 writable tables (added test_steps, recorded_sessions, session_actions, api_keys, integrations, export_schemas, app_contexts, sprint_changes, media_attachments) | `migrations/20240101000019_demo_account.sql` |
| C3/C4 | New `seed-prod.sql` (demo account only, idempotent, no public admin creds); deploy guide updated to forbid `db reset --linked` and add a demo-seed step + DATABASE_URL note; removed personal gmail from local seed; strengthened seed.sql header | `supabase/seed-prod.sql`, `supabase/seed.sql`, `artifacts/01-Production-Deployment-Guide.md` |
| H4/H5 | `acquireSlot` added; concurrency acquire+release now paired in `executeTestOrchestration` `finally` (guarded, no leak, covers all exit paths); `demoRunLimiter` mounted on run POST; `aiLimiter` mounted on /ai routes | `middleware/concurrency-limiter.ts`, `websocket/handlers/test.handler.ts`, `routes/test-runs.routes.ts`, `app.ts` |
| H2/H3 (demo direction) | Scripted live-replay: completed runs animate into terminal + timeline + filmstrip with realistic timing (cancellable); Replay button added; `seed-prod.sql` seeds steps + screenshots for all 10 runs; local seed gets screenshots on its 5 runs | `components/projects/run-detail-client.tsx`, `supabase/seed-prod.sql`, `supabase/seed.sql` |
| M2 | "Demo data resets daily" copy removed from all 3 places (banner, /demo page, landing) → honest read-only wording | `demo-banner.tsx`, `app/demo/page.tsx`, `app/(landing)/page.tsx` |
| M3 | Playwright export now uses the project's real `base_url` (was hardcoded `https://example.com`); run-detail API returns `projects(base_url)` | `routes/test-runs.routes.ts`, `run-detail-client.tsx` |

## Follow-up round (Redis + demo throttle) — 2026-06-12

| Finding | Fix shipped | Files |
|---------|-------------|-------|
| M1 | **Redis-backed multi-instance** (not single-instance pinning). New `config/redis.ts` (ioredis, lazy, in-memory fallback when REDIS_URL unset). Concurrency cap now atomic via Lua INCR/DECR with a 600s safety TTL; rate limits use `rate-limit-redis` stores; socket.io uses `@socket.io/redis-adapter` so live streaming fans out across replicas. All async; degrades to in-memory locally. | `config/redis.ts`, `middleware/concurrency-limiter.ts`, `middleware/rate-limiter.ts`, `websocket/socket-server.ts`, `websocket/handlers/test.handler.ts`, `routes/test-runs.routes.ts`, `package.json` |
| M4 | `demoAuthLimiter` (10/min per IP) added and mounted on `POST /api/auth/demo` to stop public session-minting / Supabase Auth hammering. | `middleware/rate-limiter.ts`, `routes/auth.routes.ts` |
| Deploy gap | Railway env list was missing **`SUPABASE_ANON_KEY`** (required by env.ts; used by `/demo`) → would fail boot. Added, plus `REDIS_URL` guidance (blank for 1 replica, set for 2+). | `artifacts/01-Production-Deployment-Guide.md` |

Verified after this round: `vitest run` 22/22 pass (concurrency tests migrated to async); `tsc --noEmit` clean for `@qaforge/api`. Added deps: `ioredis`, `rate-limit-redis`, `@socket.io/redis-adapter` (pnpm install succeeded).

## Still deliberately NOT changed
- **Screenshots** use `placehold.co` URLs (external dependency at view time). Swap for real artifact URLs/storage when convenient.
- **Cosmetic:** seed URLs are still `*.example.com`; `JWT_SECRET` is required by env.ts but unused. Left as-is.
- **Demo profile cache** stays in-memory per-instance — it's a perf cache, not a correctness/limit primitive (worst case: a profile change is stale ≤5 min on a given replica). Not worth a Redis round-trip.

## What's genuinely good (verified)
- Server-side demo auth correctly keeps creds out of the client bundle (T1 premise holds).
- `authenticate` does a live `getUser()` (revoked-token safe); demo profile cache is sound (T9).
- `resolveAIKey` extraction is a clean DRY fix (T7); 22 unit tests pass.
- Seed data narrative is high-quality (browser-specific bugs, AI-vs-manual flags, fresh relative timestamps).
- Accessibility touches (aria-live terminal, role="status" banner) are solid.

