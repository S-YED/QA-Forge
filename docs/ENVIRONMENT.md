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
| `DATABASE_URL` | yes (schema) | **Never read by code**; to become optional (DX-1) |
| `ENCRYPTION_KEY` | yes, 64 chars | AES-256-GCM key for stored AI keys. Must be hex (`node -e "console.log(crypto.randomBytes(32).toString('hex'))"`); hex is not yet validated |
| `JWT_SECRET` | yes (schema) | **Never read by code**; to become optional (DX-1) |
| `REDIS_URL` | optional | Shared concurrency counter + socket.io Redis adapter |
| `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_MODEL`, `OPENROUTER_MODEL` | optional | Model overrides, read in `packages/ai-engine` |

AI provider keys are **not** env vars. Each user adds them in Settings → API Keys, and they are stored encrypted per user.

## Web: `apps/web/.env.local`
| Var | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Public key. **Docs and `.env.example` wrongly say `NEXT_PUBLIC_SUPABASE_ANON_KEY`** (DX-1) |
| `NEXT_PUBLIC_API_URL` | default `http://localhost:4000` | REST and socket.io base URL (no separate WS var) |

`NEXT_PUBLIC_WS_URL` in the root `.env.example` is unused.

## Local ports
Web 3000 (repo memory notes use 3005 when 3000 is taken) · API 4000 · Supabase API 54321 · DB 54322 ·
Studio 54323 · Inbucket 54324.
