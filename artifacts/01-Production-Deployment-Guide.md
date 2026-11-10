# QAForge — Production Deployment Guide

Deploy QAForge to production using the free stack: **Supabase Cloud** (database + auth) + **Railway** (Express API) + **Vercel** (Next.js frontend).

---

## Architecture Overview

```
Browser → Vercel (Next.js apps/web) → Railway (Express apps/api) → Supabase Cloud (PostgreSQL + Auth)
```

---

## Part 1: Supabase Cloud — Database & Auth (Free Tier)

### 1.1 Create a New Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Fill in: project name, database password (save this), and region (choose closest to your users)
3. Wait approximately 2 minutes for provisioning to complete

### 1.2 Enable pgvector Extension

The `app_contexts` table uses `extensions.vector(1536)` for AI embedding storage. You must enable this before pushing migrations.

1. Dashboard → **Database** → **Extensions**
2. Search for `vector`
3. Toggle it on → set schema to `extensions`

### 1.3 Link the Supabase CLI

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Your project ref is the string in your Supabase dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`.

### 1.4 Push Migrations

```bash
supabase db push
```

This applies all 25 migration files from `supabase/migrations/` to your cloud database in order: the tables with RLS policies and triggers, the demo read-only lockdown (19), the profile privilege fix (22), the step `action` backfill (23), the private screenshot bucket (24) and the run/case RLS tightening (25). Run `supabase db push --dry-run` first to see exactly which migrations it will apply.

After pushing, check that only the accounts you expect are admins (read-only):

```sql
SELECT id, email, role, updated_at FROM public.profiles WHERE role = 'admin';
```

> **⛔ Never run `supabase db reset` (or `db reset --linked`) against production** — it DROPS and recreates the database, destroying all data. Use `db push` only. Do **not** run `supabase/seed.sql` in production either: it creates developer/admin accounts with a shared, git-committed password.

### 1.4b Seed the Demo Account (production-safe)

The public `/demo` link signs in as `demo@qaforge.dev`. That account and its sample data do **not** exist after `db push` — you must seed them, or `/api/auth/demo` will fail. Run the production-safe seed (demo account only, no admin credentials):

```bash
psql "$DATABASE_URL" -f supabase/seed-prod.sql
```

Or paste `supabase/seed-prod.sql` into Supabase Studio → **SQL Editor** → **Run**. It is idempotent (safe to re-run).

### 1.5 Get Your Credentials

Dashboard → **Project Settings** → **API**:

| Credential | Used As |
|---|---|
| Project URL | `SUPABASE_URL` (API) and `NEXT_PUBLIC_SUPABASE_URL` (web) |
| `anon` public key | `SUPABASE_ANON_KEY` (API) |
| publishable key (`sb_publishable_...`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (web) |
| `service_role` secret key | `SUPABASE_SERVICE_ROLE_KEY` (API only — never expose to frontend) |

The API does not need a database connection string. You only need one for `psql` (the seed step above): Dashboard → **Project Settings** → **Database** → **Connection string**, session pooler (the direct host is IPv6-only).

---

## Part 2: Railway — Express API (~Free Tier)

### 2.1 Create a New Project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your QAForge repository
3. **Do NOT set a Root Directory** — leave it blank (repo root)

> **Why repo root?** `apps/api/package.json` declares a dependency on `@qaforge/shared-types` using `workspace:*`. pnpm workspace dependencies are resolved from the repository root via `pnpm-workspace.yaml`. If you set the Root Directory to `apps/api`, Railway's build context will be scoped to that subfolder and `pnpm install` will fail because it cannot find the workspace root or the `packages/shared-types` package.

### 2.2 Configure Build & Start Commands

Leave the Build Command and Start Command fields blank. `railway.json` tells Railway to build the repo-root `Dockerfile`, which:

1. installs the API and the workspace packages it depends on (`pnpm install --filter "@qaforge/api..."`, dev dependencies included, so `tsc` is available) and builds them in dependency order;
2. installs only Chromium's headless shell with its system libraries (`playwright install --with-deps --only-shell chromium`), the browser headless test runs launch;
3. runs `node apps/api/dist/index.js` as the unprivileged `node` user, with `NODE_ENV=production`.

`.dockerignore` is an allowlist: only the API, the shared packages and the workspace manifests enter the image, never `.env` files or the web app. The same image runs on any Docker host:

```bash
docker build -t qaforge-api .
docker run --env-file apps/api/.env -p 4000:4000 qaforge-api
```

Set **Replicas to 1** in the service settings (see "Run exactly one API instance" below).

### 2.3 Set Environment Variables

Add all of the following in Railway → **Variables**:

```
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://your-vercel-app.vercel.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<anon public key from Supabase dashboard → API>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase dashboard>
ENCRYPTION_KEY=<generate fresh 64-char hex — see command below>
```

> **All of the above are required.** The API validates them on boot and exits with one line per bad variable (`apps/api/src/config/env.ts`). `SUPABASE_ANON_KEY` is needed by the `/api/auth/demo` endpoint. `DATABASE_URL` and `JWT_SECRET` are no longer used; remove them if an old service still has them.

> **Leave `ALLOW_PRIVATE_HOSTS` and `AI_LOCAL_DEMO` unset in production.** The first lets test runs reach private and loopback addresses (an SSRF hole on a server); the second serves fixed example tests instead of AI. Both are for local development only.

> **Chromium:** the Docker image contains Chromium's headless shell and its system libraries. Verified locally on 10 Nov: the image (1.21 GB) ran with `NODE_ENV=production` against Supabase, a run against the live Vercel site passed with signed screenshots, and a private target was refused by the SSRF guard.

> **Important:** Generate a **fresh** `ENCRYPTION_KEY` for production — do not reuse your local development key. Any keys encrypted with the local key will not be decryptable with a different production key.

#### Run exactly one API instance

Keep the Railway service at **1 replica**. On boot the API marks every `pending`/`running` run as interrupted, which is right after a restart but would kill live runs on other replicas (TD-3 in `artifacts/TECHNICAL_DECISIONS.md`). `REDIS_URL` is optional: when set, run-concurrency counts, rate limits and the socket.io adapter use Redis, but that alone does not make several replicas safe.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Note:** `CORS_ORIGIN` must be updated after you deploy to Vercel (Step 3). Set a placeholder now and update it once you have the Vercel URL.

### 2.4 Deploy & Verify

Railway auto-assigns a URL like `https://qaforge-api.up.railway.app`.

Test the health check:
```
GET https://your-railway-url.up.railway.app/api/health
```

Expected response:
```json
{ "status": "ok", "timestamp": "...", "version": "2.0.0-mvp" }
```

---

## Part 3: Vercel — Next.js Frontend (Free Tier)

### 3.1 Create a New Project

1. Go to [vercel.com](https://vercel.com) → **New Project** → **Import from GitHub**
2. Select your QAForge repository
3. Set **Root Directory** to `apps/web`
4. Framework: **Next.js** (auto-detected)

### 3.2 Set Environment Variables

Add the following in Vercel → **Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key (sb_publishable_...) from Supabase dashboard → API Keys>
NEXT_PUBLIC_API_URL=https://your-railway-url.up.railway.app
```

> The web client (`apps/web/lib/supabase/client.ts`) reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the new-format publishable key, not the legacy JWT `anon` key.

### 3.3 Deploy

Click **Deploy**. Vercel assigns a URL like `https://qaforge.vercel.app`.

### 3.4 Post-Deploy: Update CORS on Railway

Go back to Railway → **Variables** → update `CORS_ORIGIN` to your exact Vercel URL:

```
CORS_ORIGIN=https://qaforge.vercel.app
```

The Express CORS middleware in `apps/api/src/app.ts` splits `CORS_ORIGIN` by comma, so you can add multiple origins if needed (e.g., preview deployments).

### 3.5 Post-Deploy: Configure Supabase Auth Redirects

Go to Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `https://qaforge.vercel.app`
- **Redirect URLs**: Add `https://qaforge.vercel.app/dashboard/projects`

This ensures Supabase Auth redirects users to your production frontend after email confirmation.

---

## Post-Deploy Checklist

- [ ] `supabase db push` completed without errors (all 25 migrations applied)
- [ ] Admin audit query shows only expected admins
- [ ] Railway service has 1 replica; `ALLOW_PRIVATE_HOSTS` and `AI_LOCAL_DEMO` unset
- [ ] A test run passes with screenshots (Chromium works on Railway): project base URL `https://<your-vercel-app>/`, case steps **navigate** `/login` then **assert visible** `input[type="email"]`. (Don't use example.com: it has no `h1` any more and asks not to be used for testing.)
- [ ] pgvector extension enabled in Supabase Cloud
- [ ] `supabase/seed-prod.sql` run against the cloud DB (demo account + sample data)
- [ ] Railway API health check returns HTTP 200 with `{"status":"ok"}`
- [ ] Vercel frontend loads at `/login` without errors
- [ ] `/demo` auto-signs in as the demo account and lands on the dashboard with sample data
- [ ] Login with a test account works end-to-end
- [ ] Sign up works: the "Sign up" link on `/login` creates an account (with email confirmation on, the confirmation link must land on the Vercel URL configured in 3.5)
- [ ] Creating a project works (tests the full browser → Vercel → Railway → Supabase round trip)
- [ ] `CORS_ORIGIN` on Railway matches the Vercel URL exactly (no trailing slash)
- [ ] Supabase Auth redirect URLs include the Vercel URL

---

## Free Tier Limits

| Service | Free Tier Limit |
|---|---|
| Supabase | 500 MB database storage, 2 active projects, 50,000 monthly active users |
| Vercel | 100 GB bandwidth/month, unlimited deployments, 1 concurrent build |
| Railway | $5 credit/month (~500 hours of a 512 MB container at ~$0.01/hour) |

Railway's free credit is sufficient for a low-traffic MVP. Upgrade to a paid plan when you need persistent uptime beyond the credit limit.
