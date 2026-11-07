# Environment Variables (what the code actually reads, audited 5 Nov 2026)

## API: `apps/api/.env` (loaded by `dotenv/config` from the API's working directory; validated by Zod in `apps/api/src/config/env.ts`, process exits if invalid)
| Var | Required | Purpose / source |
|---|---|---|
| `PORT` | default 4000 | HTTP + socket.io port |
| `NODE_ENV` | default development | `production` hides error details |
| `CORS_ORIGIN` | default `http://localhost:3000` | Comma-separated allowed web origins (HTTP + socket.io) |
| `SUPABASE_URL` | yes | Local: `http://127.0.0.1:54321` (`supabase status`) |
| `SUPABASE_ANON_KEY` | yes | Public key from `supabase status` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Secret, backend only, bypasses RLS |
| `ENCRYPTION_KEY` | yes, 64 hex chars (validated) | AES-256-GCM key for stored AI keys: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it: changing it makes stored keys unreadable |
| `REDIS_URL` | optional | Shared concurrency counter + socket.io Redis adapter |
| `ALLOW_PRIVATE_HOSTS` | default empty | SSRF guard exemptions (comma-separated hostnames, `*` = all). `*` locally, **empty in production** |
| `AI_LOCAL_DEMO` | default `false` | `true`: users without an AI key get the fixed demo-shop tests (labelled not AI). `true` locally, off in production |
| `AI_TIMEOUT_MS` | default 60000 | AI provider request timeout |
| `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_MODEL`, `OPENROUTER_MODEL` | optional | Model overrides, read in `packages/ai-engine` |

`DATABASE_URL` and `JWT_SECRET` were required by older versions but never read; they are no longer in the schema (DX-1) and are ignored if set.
Template: `apps/api/.env.example` (tested: the API boots from it once `ENCRYPTION_KEY` is generated). An invalid value stops startup with one line per variable.

AI provider keys are **not** env vars. Each user adds them in Settings → API Keys, and they are stored encrypted per user.

## Web: `apps/web/.env.local`
| Var | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Public (publishable/anon) key. Never the secret key: `NEXT_PUBLIC_` values reach the browser |
| `NEXT_PUBLIC_API_URL` | default `http://localhost:4000` | REST and socket.io base URL (no separate WS var) |

Template: `apps/web/.env.example`. A test keeps it equal to the `NEXT_PUBLIC_` variables the web code reads.
The root `.env.example` only points to the two per-app templates.

## Local ports
Web 3000 (repo memory notes use 3005 when 3000 is taken) · API 4000 · Supabase API 54321 · DB 54322 ·
Studio 54323 · Inbucket 54324.
