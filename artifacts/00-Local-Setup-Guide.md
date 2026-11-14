# QA Forge: Local Setup Guide

The short version is in the [README](../README.md): `pnpm bootstrap`, then `pnpm dev`. This guide explains what
bootstrap does, how to do each step by hand, and how to fix the usual problems.

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20 or newer | `node --version` |
| pnpm | 9.15.4 (pinned in `package.json`; `corepack enable` provides it) | `pnpm --version` |
| Docker Desktop or Docker Engine | running | `docker info` |

The Supabase CLI and Playwright are dev dependencies of the repo, so `pnpm install` brings them. No global installs.

## What `pnpm bootstrap` does

Each step is safe to repeat. Run it again any time; it never overwrites a value you set and never resets the database.

1. Checks Node, pnpm and that the Docker engine answers.
2. `pnpm install`.
3. Builds the shared packages (`packages/*`); the apps import their built output.
4. `pnpm exec supabase start`. The first start downloads the images, applies all migrations and loads `supabase/seed.sql`.
5. `pnpm exec supabase migration up`, which applies migrations added since your last start without touching your data.
6. Writes only the missing values in `apps/api/.env` and `apps/web/.env.local`, creating them from the
   `.env.example` next to each when absent:
   - API: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `supabase status`, and a new
     random `ENCRYPTION_KEY` only when the current one is empty.
   - Web: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
7. Installs Playwright's Chromium.
8. Runs the same checks as `pnpm check-setup`.

## Doing it by hand

```bash
corepack enable
pnpm install
pnpm turbo run build --filter=./packages/*
pnpm db:start                     # supabase start
pnpm exec supabase status         # prints the URL and keys you need below
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @qaforge/playwright-runner exec playwright install chromium
```

Fill in the two env files:

| File | Variable | Value |
|---|---|---|
| `apps/api/.env` | `SUPABASE_URL` | Project URL from `supabase status` (`http://127.0.0.1:54321`) |
| | `SUPABASE_ANON_KEY` | Publishable (anon) key |
| | `SUPABASE_SERVICE_ROLE_KEY` | Secret (service_role) key. Backend only, never in the web app or in git |
| | `ENCRYPTION_KEY` | 64 hex characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it: changing it makes stored AI keys unreadable |
| `apps/web/.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | Same Project URL |
| | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key. Never the secret key: this file reaches the browser |

The example files already hold working local defaults for everything else, including `ALLOW_PRIVATE_HOSTS=*` (so runs
can reach the demo shop on 127.0.0.1) and `AI_LOCAL_DEMO=true` (example tests without an AI key). Both must be off in
production. Every variable is described in [`docs/ENVIRONMENT.md`](../docs/ENVIRONMENT.md).

Then check and start:

```bash
pnpm check-setup
pnpm dev
```

## Ports and accounts

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:4000 (health: `/api/health`) |
| Demo shop | http://127.0.0.1:4100 |
| Supabase API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (local email) | http://127.0.0.1:54324 |

Seeded accounts, password `Password123!` for all: `alice@qaforge.dev` (admin; admins bypass row-level security),
`bob@qaforge.dev` (tester) and `demo@qaforge.dev` (read-only, used by `/demo`).

If the web app runs on another port (for example `PORT=3005 pnpm --filter @qaforge/web dev`), add that origin to
`CORS_ORIGIN` in `apps/api/.env` (comma-separated) and restart the API.

## Running the tests

```bash
pnpm test                                        # unit tests
pnpm --filter @qaforge/api test:integration      # against local Supabase
pnpm test:e2e                                    # browser end to end; starts API, web and demo shop if not running
```

`pnpm test:e2e` expects the web app on port 3000. If yours is elsewhere, set `E2E_WEB_URL`, for example
`E2E_WEB_URL=http://localhost:3005 pnpm test:e2e`. Failure traces land in `.e2e-results/`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `check-setup` says Docker is "not answering (timed out)" | Docker is hung, common on Windows with WSL. Quit Docker Desktop, run `wsl --shutdown` (or reboot), reopen Docker Desktop |
| Test runs fail to reach `127.0.0.1` on Windows | Same WSL state; restart WSL as above |
| API exits at startup listing variables | It names each bad variable. Usually an empty Supabase key or an `ENCRYPTION_KEY` that is not 64 hex characters |
| `Base URL not allowed` on a run | The target resolves to a private address. Locally set `ALLOW_PRIVATE_HOSTS=*` (or the host name) in `apps/api/.env` |
| AI generate says no API key | Add a key in Settings, API Keys, or set `AI_LOCAL_DEMO=true` for the labelled example tests |
| Browser shows CORS errors | The web app's origin is missing from `CORS_ORIGIN` |
| Port conflicts on 5432x | Change the ports in `supabase/config.toml` and rerun `pnpm bootstrap` |
| You want a clean database | `pnpm db:reset` (wipes local data, reapplies migrations and the seed) |
| Windows: tests fail to start with `ERR_PACKAGE_IMPORT_NOT_DEFINED` (`#module-evaluator`) | The clone path is too deep: pnpm's nested paths pass Windows' 260-character limit. Clone to a short path such as `C:\dev\qa-forge`, or enable long paths (`LongPathsEnabled=1`, needs admin) |
| `pnpm build` fails while `pnpm dev` is running | Stop the web dev server first; both write `apps/web/.next` |
