# QAForge — Local Setup Guide

A complete step-by-step guide for running QAForge on your local machine.

---

## Prerequisites

Install the following tools before proceeding:

| Tool | Version | Install Command | Verify |
|---|---|---|---|
| Docker Desktop | Latest | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) | `docker --version` |
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) | `node --version` |
| pnpm | ≥ 8 | `npm install -g pnpm` | `pnpm --version` |
| Supabase CLI | Latest | `npm install -g supabase` | `supabase --version` |

> **Docker Desktop must be running** before you start Supabase. All Supabase local services run inside Docker containers.

---

## Step 1 — Start Supabase Locally

```bash
supabase start
supabase db reset
supabase status
```

**What each command does:**

- `supabase start` — Pulls and starts all Supabase Docker containers (PostgreSQL on port 54322, API on port 54321, Studio on port 54323, Inbucket email on port 54324).
- `supabase db reset` — Drops and recreates the local database, applies all 17 migration files in `supabase/migrations/` in order, then runs `supabase/seed.sql` to populate demo data. Run this any time you want a clean slate.
- `supabase status` — Prints the connection details you need for your `.env` files:

```
API URL: http://127.0.0.1:54321
anon key: eyJ...
service_role key: eyJ...
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
```

Copy these values — you will paste them into the next two steps.

---

## Step 2 — Create `apps/api/.env`

This file does **not** exist yet. You must create it manually.

Create the file at `apps/api/.env` with the following content:

```
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
SUPABASE_URL=<paste API URL from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<paste service_role key from supabase status>
DATABASE_URL=<paste DB URL from supabase status>
ENCRYPTION_KEY=<generate with command below>
JWT_SECRET=<any random string of 32+ characters>
REDIS_URL=
```

**Variable explanations:**

| Variable | Description |
|---|---|
| `PORT` | The port the Express server listens on. Default: `4000`. |
| `NODE_ENV` | Sets development mode — enables pretty Winston logs and non-redacted error messages. |
| `CORS_ORIGIN` | Allows the Next.js frontend at `http://localhost:3000` to call the API. Supports comma-separated values for multiple origins. |
| `SUPABASE_URL` | The local Supabase API endpoint. Paste the API URL from `supabase status` — typically `http://127.0.0.1:54321`. |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role key that bypasses Row-Level Security. **Backend-only — never expose this to the frontend or commit it to version control.** |
| `DATABASE_URL` | Direct PostgreSQL connection string. Paste the DB URL from `supabase status` — typically `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. |
| `ENCRYPTION_KEY` | A 64-character hex string (32 bytes) used for AES-256-GCM encryption of stored API keys. Must be exactly 64 hex characters — Zod enforces `.length(64)` at startup. |
| `JWT_SECRET` | Used for internal token validation. Any random string of 32 or more characters. |
| `REDIS_URL` | Intentionally blank. BullMQ job queues are a post-MVP feature. The Redis client is a no-op stub in MVP. |

**Generate your `ENCRYPTION_KEY`:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This outputs a 64-character hex string. Paste it as the value of `ENCRYPTION_KEY`.

---

## Step 3 — Fill `apps/web/.env.local`

This file already exists at `apps/web/.env.local` but its values are empty. Fill in the three variables:

```
NEXT_PUBLIC_SUPABASE_URL=<paste API URL from supabase status>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon key from supabase status>
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**Variable explanations:**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase endpoint used by the browser client (`createBrowserClient`). Paste the API URL from `supabase status`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The public anon key. Safe to expose in the browser — Row-Level Security enforces data isolation at the database layer. |
| `NEXT_PUBLIC_API_URL` | The base URL of the Express API. The typed `apiClient` in `lib/api/client.ts` prepends this to all requests. |

---

## Step 4 — Install Dependencies

From the workspace root:

```bash
pnpm install
```

pnpm resolves all workspace packages (`apps/web`, `apps/api`, `packages/shared-types`, `packages/ai-engine`, `packages/playwright-runner`, `packages/export-engine`, `packages/integrations`) in a single pass with strict hoisting control.

---

## Step 5 — Run Both Apps

```bash
pnpm dev
```

Turborepo starts both apps concurrently:

- `apps/api` — Express server with `tsx watch src/index.ts` (hot-reload on file changes) → **port 4000**
- `apps/web` — Next.js App Router with `next dev` → **port 3000**

---

## Access URLs

| Service | URL |
|---|---|
| Frontend (Next.js) | http://localhost:3000 |
| Backend API (Express) | http://localhost:4000 |
| API Health Check | http://localhost:4000/api/health |
| Supabase Studio | http://localhost:54323 |

The health check returns:
```json
{ "status": "ok", "timestamp": "...", "version": "1.0.0-mvp" }
```

---

## Seed Data

`supabase db reset` automatically runs `supabase/seed.sql` after applying all migrations. The seed creates fully reproducible demo data with fixed UUIDs:

| Entity | Details |
|---|---|
| Users | `alice@qaforge.dev` (role: admin) and `bob@qaforge.dev` (role: tester) — password: `Password123!` |
| Projects | "E-Commerce Platform" (`https://shop.example.com`) and "Admin Dashboard" (`https://admin.example.com`) — both owned by Alice |
| Test Suites | "Authentication" (root suite) and "Login Flows" (child of Authentication) |
| Test Cases | 3 cases: "Successful login with valid credentials" (critical), "Login fails with incorrect password" (high), "Password reset email is sent" (medium, AI-generated) |
| Test Runs | 2 runs: one `passed` (chromium, ai_driven, 4230ms) and one `failed` (firefox, ai_driven, 1850ms) |
| Recorded Session | "Checkout Flow Recording" (chromium, completed, 18450ms) |

Log in at http://localhost:3000/login with either seed account to explore the platform.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `supabase start` fails immediately | Docker Desktop is not running. Start it first and wait for it to fully initialize. |
| Port conflicts on 54321/54322/54323 | Check `supabase/config.toml` — the `[api]`, `[db]`, and `[studio]` sections define the ports. Change them if needed. |
| `ENCRYPTION_KEY` validation error on API startup | The key must be exactly 64 hex characters (32 bytes). Regenerate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `pnpm: command not found` | Run `npm install -g pnpm` then restart your terminal. |
| `supabase: command not found` | Run `npm install -g supabase` then restart your terminal. |
| API returns 401 on all requests | The `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env` is wrong. Re-run `supabase status` and paste the correct values. |
| Frontend shows blank page | Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local` are filled in. |
