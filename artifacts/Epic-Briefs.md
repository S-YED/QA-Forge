# QAForge — Epic Briefs (All MVP-1 Phases)

Comprehensive documentation of all four MVP-1 phases: what was built, why, key technical decisions, and outcomes.

---

## MVP-1A: Monorepo Foundation & Tooling

### Summary

Established the pnpm + Turborepo monorepo structure with TypeScript across all packages and apps. Created the workspace skeleton: `apps/web` (Next.js 14), `apps/api` (Express), `packages/shared-types`, `packages/ai-engine`, `packages/playwright-runner`, `packages/export-engine`, `packages/integrations`.

### Problem / Context

No project structure existed. The platform needed a strict monorepo that enforces shared types, consistent tooling, and parallel builds from day one — before any application code was written.

### What Was Built

**Root workspace files:**
- `pnpm-workspace.yaml` — defines `apps/*` and `packages/*` as workspace members
- `turbo.json` — Turborepo pipeline: `build` (depends on `^build`, outputs `dist/**` and `.next/**`), `dev` (persistent, no cache), `lint`, `type-check`
- `package.json` — root scripts: `dev`, `build`, `lint`, `format`, `type-check`; devDependencies: `turbo ^2.3.0`, `typescript ^5.7.0`, `prettier ^3.4.0`, `eslint ^8.57.0`, `@typescript-eslint/*`
- `tsconfig.json` — root TypeScript config with path aliases
- `.eslintrc.cjs` — ESLint config shared across all workspaces
- `.prettierrc` — Prettier config
- `.gitignore` — ignores `node_modules`, `.next`, `dist`, `.env*`
- `.env.example` — template for environment variables

**App packages:**
- `apps/web/package.json` — `@qaforge/web`, Next.js 14, React 18, `@qaforge/shared-types: workspace:*`, Supabase packages, Tailwind CSS
- `apps/api/package.json` — `@qaforge/api`, Express, Zod, Winston, Socket.io, `tsx` for dev, `@qaforge/shared-types: workspace:*`

**Library packages (all with `package.json`, `tsconfig.json`, `src/index.ts`):**
- `packages/shared-types` — single source of truth for all shared TypeScript types
- `packages/ai-engine` — stub for MVP-2 AI generation
- `packages/playwright-runner` — stub for MVP-2 test execution
- `packages/export-engine` — stub for future export features
- `packages/integrations` — stub for future Jira/GitHub integrations

### Key Technical Decisions

- **pnpm workspaces** over npm/yarn for strict hoisting control and disk efficiency
- **Turborepo** for parallel task execution, dependency-aware ordering, and build caching
- **`"type": "module"`** in all packages for native ESM
- **`@qaforge/*` namespace** for all internal packages — prevents naming collisions and makes workspace dependencies explicit
- **`workspace:*`** protocol for internal dependencies — pnpm resolves these to local packages at install time

### Outcome

Clean monorepo that compiles with zero TypeScript errors. `pnpm install` from root resolves all 7 workspace packages. `pnpm dev` starts both apps concurrently via Turborepo. `pnpm build` produces `dist/` for `apps/api` and `.next/` for `apps/web`.

---

## MVP-1B: Database Schema & Supabase Setup

### Summary

Designed and implemented the complete PostgreSQL database schema via 17 Supabase migration files. Established Row-Level Security on all 15 tables, created triggers for profile auto-creation and `updated_at` timestamps, and wrote comprehensive seed data.

### Problem / Context

No database existed. The platform needed a fully relational schema with security enforced at the database layer — not just the application layer — so that even direct database access cannot bypass user isolation.

### What Was Built

**17 migration files in `supabase/migrations/` (applied in order):**

| # | File | What It Creates |
|---|---|---|
| 1 | `20240101000001_enable_extensions.sql` | `uuid-ossp`, `vector` (pgvector), `moddatetime` extensions in `extensions` schema |
| 2 | `20240101000002_create_profiles.sql` | `profiles` table + `handle_new_user()` trigger + `on_auth_user_created` trigger on `auth.users` |
| 3 | `20240101000003_create_api_keys.sql` | `api_keys` table with `UNIQUE(user_id, provider)` constraint |
| 4 | `20240101000004_create_projects.sql` | `projects` table with `user_id` index and `created_at DESC` index |
| 5 | `20240101000005_create_test_suites.sql` | `test_suites` table with self-referential `parent_suite_id` FK |
| 6 | `20240101000006_create_test_cases.sql` | `test_cases` table with `steps JSONB`, `tags TEXT[]`, priority/type/source enums |
| 7 | `20240101000007_create_test_runs.sql` | `test_runs` table with status/mode enums, no `updated_at` by design |
| 8 | `20240101000008_create_test_steps.sql` | `test_steps` table with `metadata JSONB`, no `updated_at` by design |
| 9 | `20240101000009_create_recorded_sessions.sql` | `recorded_sessions` table with status enum, no `updated_at` by design |
| 10 | `20240101000010_create_session_actions.sql` | `session_actions` table with `action_type` enum, `coordinates JSONB` |
| 11 | `20240101000011_create_bugs.sql` | `bugs` table with severity/status enums, `assigned_to` FK (no cascade) |
| 12 | `20240101000012_create_integrations.sql` | `integrations` table with `COALESCE` unique index for nullable `project_id` |
| 13 | `20240101000013_create_export_schemas.sql` | `export_schemas` table with `columns JSONB` |
| 14 | `20240101000014_create_app_contexts.sql` | `app_contexts` table with `embedding extensions.vector(1536)` + HNSW index |
| 15 | `20240101000015_create_sprint_changes.sql` | `sprint_changes` table with `affected_areas TEXT[]`, no `updated_at` |
| 16 | `20240101000016_create_media_attachments.sql` | `media_attachments` polymorphic table (no FK — `entity_type` discriminator) |
| 17 | `20240101000017_create_updated_at_triggers.sql` | `update_updated_at()` function + `set_updated_at` trigger on 9 tables |

**Supporting files:**
- `supabase/config.toml` — local dev config: API port 54321, DB port 54322, Studio port 54323, pgvector enabled
- `supabase/seed.sql` — 2 users (alice/bob), 2 projects, 2 suites, 3 cases, 2 runs, 5 test steps, 1 recorded session — all with fixed UUIDs for reproducibility
- `supabase/SETUP.md` — comprehensive setup guide

**Shared types (`packages/shared-types/src/`):**
- `database.ts` — TypeScript interfaces: `Profile`, `ApiKey`, `Project`, `TestRun`, `TestStep`, `RecordedSession`, `SessionAction`
- `enums.ts` — TypeScript enums: `TestRunStatus`, `TestRunMode`, `TestStepStatus`, `ActionType`, `ApiKeyProvider`, `UserRole`, `SessionStatus`, `BugSeverity`, `BugStatus`
- `api.ts` — Request/response DTOs: `CreateProjectRequest`, `UpdateProjectRequest`, `CreateApiKeyRequest`, `ApiKeyResponse` (omits `encrypted_key`), `CreateTestRunRequest`, `PaginatedResponse<T>`, `ApiError`
- `websocket.ts` — Socket.io event payload types: `TestStepStartEvent`, `TestStepCompleteEvent`, `TestScreenshotEvent`, `TestCompleteEvent`, `RecordingActionEvent`, `SessionFrameEvent`

### Key Technical Decisions

- **RLS on every table** — security enforced at the DB layer; the service role key on the backend bypasses RLS intentionally, but direct DB access from untrusted clients is blocked
- **Mixed FK delete strategy** — ownership-chain FKs use `ON DELETE CASCADE` (e.g., `projects.user_id`, `test_suites.project_id`, `test_cases.suite_id`, `test_runs.project_id`, `test_runs.user_id`, `bugs.project_id`), so deleting a project cascades through suites → cases → runs → steps. However, several FKs intentionally diverge:
  - `test_suites.parent_suite_id` → `ON DELETE SET NULL` — deleting a parent suite unlinks children rather than destroying the entire hierarchy
  - `test_runs.test_case_id` → `ON DELETE SET NULL` — preserves historical run records even if the originating test case is removed
  - `bugs.test_run_id` → `ON DELETE SET NULL` — keeps bug reports intact when the associated test run is deleted
  - `bugs.assigned_to` → bare `REFERENCES` (no cascade) — profile deletions must not cascade-delete bugs; the assignee simply becomes a dangling reference (application-level cleanup expected)
- **AES-256-GCM encryption for `api_keys.encrypted_key`** — plaintext API keys are never stored; the `encrypted_key` column stores `iv_hex:authTag_hex:ciphertext_hex`
- **pgvector `vector(1536)`** — matches OpenAI `text-embedding-ada-002` / `text-embedding-3-small` dimensions; HNSW index with cosine distance for fast ANN search
- **`handle_new_user()` trigger** — `SECURITY DEFINER` function that auto-creates a `profiles` row on every `auth.users` INSERT; extracts `full_name` and `avatar_url` from `raw_user_meta_data`
- **`update_updated_at()` trigger** — applied to 9 tables that have `updated_at`; 6 tables (`test_runs`, `test_steps`, `recorded_sessions`, `session_actions`, `sprint_changes`, `media_attachments`) deliberately omit `updated_at` as they are append-only
- **Polymorphic `media_attachments`** — `entity_type` + `entity_id` pattern; no FK constraint possible on polymorphic references; RLS policy branches on `entity_type`
- **`COALESCE` unique index on `integrations`** — handles nullable `project_id` correctly since `NULL != NULL` in SQL

### Outcome

15 tables live with full RLS. `supabase db reset` applies all 17 migrations and seed data in under 30 seconds. Schema verified via Supabase Studio at http://localhost:54323.

---

## MVP-1C: Backend API Base (Express + Auth + Routes)

### Summary

Built the complete Express.js API with Supabase JWT authentication middleware, Zod environment validation, AES-256-GCM encryption utilities, Winston logging, rate limiting, and full CRUD routes for projects and API keys.

### Problem / Context

No backend existed. The frontend needed a secure API that validates Supabase JWTs on every request, encrypts sensitive data at rest, and provides typed endpoints for all core resources.

### What Was Built

**Entry point & app setup:**
- `apps/api/src/index.ts` — imports `dotenv/config` first (before any local module), creates HTTP server, attaches Socket.io, starts listening on `env.PORT`
- `apps/api/src/app.ts` — Express app: JSON body parser (10MB limit), CORS with origin allowlist, global rate limiter, `/api/health` (unauthenticated), auth/projects/api-keys routers, 404 catch-all, global error handler

**Config:**
- `apps/api/src/config/env.ts` — Zod schema validates all 9 env vars at startup; fails fast with `process.exit(1)` on invalid config; `ENCRYPTION_KEY` enforced as `.length(64)`; `REDIS_URL` is optional
- `apps/api/src/config/supabase.ts` — `createClient` with service role key; `autoRefreshToken: false`, `persistSession: false` for server-side use
- `apps/api/src/config/redis.ts` — no-op stub; `redisClient = null`; `connectRedis()` logs a skip message; no `ioredis` dependency

**Middleware:**
- `apps/api/src/middleware/auth.middleware.ts` — `authenticate()`: extracts Bearer token, calls `supabase.auth.getUser(token)` (live network call — detects revoked tokens), fetches `profiles` row for role, attaches `{ id, email, role }` to `req.user`
- `apps/api/src/middleware/error-handler.ts` — `AppError` class with `code`, `statusCode`, `message`, `details`; global `errorHandler` function; production mode redacts error messages
- `apps/api/src/middleware/rate-limiter.ts` — `defaultLimiter`: 100 req/min global; `aiLimiter`: 10 req/min for AI-heavy routes (MVP-2+)
- `apps/api/src/middleware/validation.ts` — `validate(schema, target)` factory: parses `req.body`/`req.query`/`req.params` with Zod; replaces raw input with parsed value; calls `next(AppError('VALIDATION_ERROR', 400, ...))` on failure

**Utilities:**
- `apps/api/src/utils/encryption.ts` — `encrypt(plaintext)`: AES-256-GCM with random 96-bit IV per call, returns `iv_hex:authTag_hex:ciphertext_hex`; `decrypt(encrypted)`: splits on `:`, sets auth tag before `update()`, throws `EncryptionError` on failure
- `apps/api/src/utils/logger.ts` — Winston logger: `debug` level in dev (colorized simple format), `warn` level in production (JSON with timestamp)
- `apps/api/src/utils/encryption.test.ts` — manual test script: round-trip, IV randomness, tampered ciphertext rejection

**Types:**
- `apps/api/src/types/express.d.ts` — augments `Express.Request` with `user: { id: string; email: string; role: string }`

**Routes:**

| Method | Route | Auth | Handler File | Description |
|---|---|---|---|---|
| GET | `/api/health` | No | `app.ts` | Returns `{ status, timestamp, version }` |
| GET | `/api/auth/me` | Yes | `auth.routes.ts` | Fetches own profile from `profiles` table |
| PUT | `/api/auth/me` | Yes | `auth.routes.ts` | Updates `full_name` and/or `avatar_url` |
| GET | `/api/projects` | Yes | `projects.routes.ts` | Lists user's projects ordered by `created_at DESC` |
| POST | `/api/projects` | Yes | `projects.routes.ts` | Creates project; validates `name` (required), `description`, `base_url` |
| GET | `/api/projects/:id` | Yes | `projects.routes.ts` | Gets project + aggregated run stats (`total_runs`, `passed_runs`, `failed_runs`) |
| PUT | `/api/projects/:id` | Yes | `projects.routes.ts` | Updates project fields; ownership enforced via `user_id` in query |
| DELETE | `/api/projects/:id` | Yes | `projects.routes.ts` | Deletes project; ownership enforced via `user_id` in query |
| GET | `/api/api-keys` | Yes | `api-keys.routes.ts` | Lists keys; **never selects `encrypted_key`** |
| POST | `/api/api-keys` | Yes | `api-keys.routes.ts` | Encrypts key, stores `key_hint` (last 4 chars), enforces `UNIQUE(user_id, provider)` |
| PUT | `/api/api-keys/:id` | Yes | `api-keys.routes.ts` | Re-encrypts key, updates `key_hint`, sets `is_valid: true` |
| DELETE | `/api/api-keys/:id` | Yes | `api-keys.routes.ts` | Deletes key; ownership enforced |
| POST | `/api/api-keys/:id/validate` | Yes | `api-keys.routes.ts` | Decrypts key, calls provider health check, persists `is_valid` result |

**Provider health checks** (`api-keys.routes.ts`):
- OpenAI: `GET https://api.openai.com/v1/models` → HTTP 200
- Anthropic: `POST https://api.anthropic.com/v1/messages` → HTTP 200 or 400 (400 = auth passed, minimal payload rejected)
- Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models?key=<key>` → HTTP 200

**WebSocket:**
- `apps/api/src/websocket/socket-server.ts` — `createSocketServer(httpServer)`: Socket.io with CORS from `env.CORS_ORIGINS`, JWT auth middleware via `supabase.auth.getUser()`, `test:start` stub (MVP-2), `recording:start` stub (MVP-3)

### Key Technical Decisions

- **Service role key on backend** — bypasses RLS; the backend is the only trusted caller; never exposed to the frontend
- **Live `supabase.auth.getUser()` on every request** — detects revoked/expired tokens; no local JWT verification that could miss revocations
- **AES-256-GCM with random 96-bit IV per encryption** — no IV reuse; `encrypt()` called twice on the same plaintext produces different ciphertext
- **`ENCRYPTION_KEY` must be exactly 64 hex chars** — Zod `.length(64)` enforces this at startup; wrong length = immediate `process.exit(1)`
- **`REDIS_URL` optional in Zod schema** — Redis is intentionally stubbed; no `ioredis` or `@upstash/redis` dependency added
- **`dotenv/config` must be the first import in `index.ts`** — if any local module (e.g., `config/env.ts`) is evaluated before dotenv, `process.env` is empty and Zod validation fails

### Outcome

API compiles with zero TypeScript errors. All routes tested manually. JWT validation rejects invalid tokens with HTTP 401. Encryption round-trip verified by `encryption.test.ts`. Rate limiting returns HTTP 429 after threshold.

---

## MVP-1D: Frontend Baseline & Auth Pipeline (Next.js)

### Summary

Built the complete Next.js App Router frontend with Supabase SSR authentication, server-side route protection via middleware, a fixed left-sidebar dashboard layout, Projects management (card grid + creation modal), Settings (AI Keys, Profile, Integrations placeholder), and a typed API client.

### Problem / Context

`apps/web` was a blank Next.js shell. No user could access the platform. The fully-built backend had no frontend consumer. Developers could only validate backend work via raw API calls.

### What Was Built

**Auth infrastructure:**
- `apps/web/lib/supabase/client.ts` — `createClient()` using `createBrowserClient` from `@supabase/ssr`; marked `'use client'`
- `apps/web/lib/supabase/server.ts` — `createServerSupabaseClient()` using `createServerClient` from `@supabase/ssr`; reads/writes cookies via `next/headers`
- `apps/web/lib/supabase/middleware.ts` — `createMiddlewareClient(request)`: creates server client with cookie getter/setter pattern; returns `{ supabase, get response() }` — the getter ensures callers always read the post-refresh response
- `apps/web/middleware.ts` — root middleware: calls `supabase.auth.getUser()` to refresh session; unauthenticated + `/dashboard/*` → redirect to `/login`; authenticated + `/login` → redirect to `/dashboard/projects`; matcher excludes `_next/static`, `_next/image`, `favicon.ico`

**API client:**
- `apps/web/lib/api/client.ts` — `apiClient` with `get`, `post`, `put`, `del` methods; `getAuthHeaders()` fetches session from browser Supabase client and attaches `Authorization: Bearer <token>`; `handleResponse<T>()` handles 401 (signs out + redirects to `/login`), non-OK responses (throws with error body message), 204 No Content

**Auth pages:**
- `apps/web/app/(auth)/layout.tsx` — centered layout: `flex min-h-screen items-center justify-center`
- `apps/web/app/(auth)/login/page.tsx` — `'use client'`; `@supabase/auth-ui-react` `<Auth>` component with `ThemeSupa`, `providers={[]}` (email+password only), `onAuthStateChange` listener redirects to `/dashboard/projects` on `SIGNED_IN`

**Dashboard layout:**
- `apps/web/app/(dashboard)/layout.tsx` — Server Component; calls `createServerSupabaseClient().auth.getUser()`; redirects to `/login` if no user; renders `<Sidebar>` + `<main>`
- `apps/web/components/layout/sidebar.tsx` — `'use client'`; fixed `w-64` sidebar; QF logo; nav links: Projects (`/dashboard/projects`), AI Keys (`/dashboard/settings/ai-keys`), Profile (`/dashboard/settings/profile`), Integrations (`/dashboard/settings/integrations`); active state via `usePathname()`; Sign Out button calls `supabase.auth.signOut()` + `router.push('/login')`

**Projects:**
- `apps/web/app/(dashboard)/dashboard/projects/page.tsx` — Server Component; fetches `GET /api/projects` with access token from session; passes `initialProjects` to `<ProjectsGrid>`
- `apps/web/components/projects/projects-grid.tsx` — `'use client'`; card grid (2-col sm, 3-col lg); empty state with "Create Project" CTA; `refreshProjects()` via `apiClient.get('/api/projects')`; opens `<CreateProjectModal>`
- `apps/web/components/projects/create-project-modal.tsx` — `'use client'`; modal with backdrop; form: `name` (required), `description`, `base_url`; calls `apiClient.post('/api/projects', body)` using `CreateProjectRequest` type; calls `onCreated()` on success
- `apps/web/app/(dashboard)/dashboard/projects/[id]/page.tsx` — "Coming in MVP-2" stub with project ID display

**Settings — AI Keys:**
- `apps/web/app/(dashboard)/dashboard/settings/ai-keys/page.tsx` — Server Component; fetches `GET /api/api-keys` with access token; passes `initialKeys` to `<AiKeysManager>`
- `apps/web/components/settings/ai-keys-manager.tsx` — `'use client'`; table: Provider, Key Hint (`••••{key_hint}`), Status badge (Valid/Unverified), Actions; `handleValidate()` calls `apiClient.post('/api/api-keys/:id/validate')`; `handleDelete()` calls `apiClient.del('/api/api-keys/:id')`; opens `<AddApiKeyModal>`
- `apps/web/components/settings/add-api-key-modal.tsx` — `'use client'`; provider select using `ApiKeyProvider` enum (OpenAI/Anthropic/Gemini); password-type key input; calls `apiClient.post('/api/api-keys', body)` using `CreateApiKeyRequest` type

**Settings — Profile:**
- `apps/web/app/(dashboard)/dashboard/settings/profile/page.tsx` — Server Component; fetches `GET /api/auth/me` with access token; passes `profile` to `<ProfileForm>`
- `apps/web/components/settings/profile-form.tsx` — `'use client'`; form: email (read-only, disabled), `full_name` (editable), `avatar_url` (editable), role (read-only display); calls `apiClient.put('/api/auth/me', body)`; shows success/error feedback

**Settings — Integrations:**
- `apps/web/app/(dashboard)/dashboard/settings/integrations/page.tsx` — "Coming Soon" placeholder

**Environment:**
- `apps/web/.env.local` — template with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL=http://localhost:4000`

### Key Technical Decisions

- **`@supabase/ssr` (not deprecated `auth-helpers`)** — correct package for Next.js App Router cookie-based sessions
- **`middleware.ts` at root** — hard server-side redirects enforced before any page renders; not client-side guards that can be bypassed
- **Server Components fetch data directly** — pages fetch with the access token from the server-side session; no client-side loading states for initial render
- **`apiClient` uses browser Supabase client for JWT** — auto-redirects to `/login` on 401; no manual token management in components
- **No `@tanstack/react-query`, no `axios`** — native `fetch` with a thin typed wrapper; keeps the bundle lean
- **`createMiddlewareClient` getter pattern** — `get response()` ensures callers always read the latest `supabaseResponse` after `setAll()` may have reassigned it during a token refresh

### Packages Added to `apps/web`

| Package | Version | Purpose |
|---|---|---|
| `@supabase/ssr` | `^0.5.0` | App Router cookie-based session management |
| `@supabase/supabase-js` | `^2.45.0` | Supabase client |
| `@supabase/auth-ui-react` | `^0.4.7` | Pre-built Auth UI component |
| `@supabase/auth-ui-shared` | `^0.1.8` | `ThemeSupa` theme for Auth UI |

### Outcome

Full auth pipeline working end-to-end. Protected routes enforced at middleware layer. Projects CRUD connected to live API. AI key management connected to live API with provider validation. Profile editing connected to live API. All pages render with server-fetched initial data.
