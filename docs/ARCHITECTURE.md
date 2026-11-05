# Architecture (as implemented, audited 5 Nov 2026)

pnpm 9.15.4 + Turborepo monorepo, TypeScript throughout. `turbo build` depends on `^build`, so workspace
packages build before their consumers.

```
apps/web  (Next.js 15.5, React 18.3, Tailwind, Supabase SSR, socket.io-client)
   │  HTTPS + Bearer <supabase access token>           │ socket.io (auth.token = same JWT)
   ▼                                                    ▼
apps/api  (Express, Zod, helmet, express-rate-limit, Winston, socket.io)
   │  service-role supabase-js (bypasses RLS)  │ @qaforge/ai-engine  │ @qaforge/playwright-runner
   ▼                                           ▼                     ▼
Supabase (Postgres 17 + RLS, Auth, Storage)    LLM HTTP APIs         headless Chromium/Firefox/WebKit
```

## Packages
| Package | Role | State |
|---|---|---|
| `apps/web` | Dashboard UI. Server components fetch the API with the session token; client components use `lib/api/client.ts` | Live |
| `apps/api` | REST API + socket.io server + test orchestration | Live |
| `packages/shared-types` | TS interfaces + enums (no runtime validation yet; see CON-1) | Live |
| `packages/ai-engine` | Prompt + fetch calls to OpenAI / Anthropic / Gemini / OpenRouter; JSON extraction | Live |
| `packages/playwright-runner` | `runTest()`: executes steps, reports per-step results + screenshots | Live, needs rewrite (RUN-1) |
| `packages/export-engine`, `packages/integrations` | One-line stubs, not imported anywhere | Deferred |

## API surface (`apps/api/src/app.ts`)
Global middleware: helmet → JSON body (10 MB) → CORS allow-list (`CORS_ORIGIN`) → default rate limiter.

| Mount | Guards |
|---|---|
| `/api/auth` (login helpers, `/me`, `/demo`) | per-route `authenticate` |
| `/api/projects` | authenticate, demoGuard |
| `/api/api-keys` | authenticate, demoGuard |
| `/api/projects/:projectId/test-suites` | authenticate, demoGuard |
| `/api/projects/:projectId/test-suites/:suiteId/test-cases` | authenticate, demoGuard |
| `/api/projects/:projectId/test-runs` | authenticate, demoGuard, `demoRunLimiter` on POST |
| `/api/projects/:projectId/ai` | authenticate, demoGuard, `aiLimiter` (10/min) |
| `/api/projects/:projectId/bugs` | authenticate, demoGuard |
| `/api/projects/:projectId/recorded-sessions` | authenticate, demoGuard (MVP-3, deferred) |

`authenticate` validates the JWT with `supabase.auth.getUser` and loads `profiles(role, is_demo)`.
`demoGuard` blocks non-GET for `is_demo` users. Errors are JSON: `{ error: { code, message, details } }`.

**Authorization model:** the API uses the **service-role** key, so RLS does not protect API queries. Every
route must scope by `user_id` / `project_id` itself. RLS protects direct PostgREST access with the public key
(the browser has that key, so RLS and column grants are a real security boundary, see migration 22).

## Real-time
`apps/api/src/websocket/socket-server.ts`: socket.io on the same HTTP server, JWT auth in `io.use`. An optional
Redis adapter is used when `REDIS_URL` is set. Rooms are `test:<runId>`; `test:join` validates run ownership.
Events and their known flaws: [EXECUTION_FLOW.md](EXECUTION_FLOW.md).

## Concurrency and scaling (honest limits)
- Execution runs **inside the API process** (no worker queue). Per-user cap is 2 concurrent runs
  (`middleware/concurrency-limiter.ts`), held in memory, or in Redis when configured.
- A restart kills in-flight runs, and nothing currently recovers them (EXE-2).
- Single-instance is the supported December topology. Multi-instance fan-out of socket events exists through the
  Redis adapter, but execution ownership is not coordinated across instances.

## Deployment (from `railway.json`, `nixpacks.toml`, memory notes)
Supabase Cloud (ap-southeast-2) + Railway API are deployed; Vercel web is pending. Local: Supabase CLI + Docker.
