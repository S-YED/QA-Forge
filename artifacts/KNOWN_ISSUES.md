# Known Issues (open)

Full descriptions: [docs/CURRENT_STATE_AUDIT.md](../docs/CURRENT_STATE_AUDIT.md). Remove rows when the fixing
ticket is **Verified** in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

| Severity | Issue | Ticket |
|---|---|---|
| CRITICAL (prod) | Migration 22 (profile self-escalation fix) not yet applied to Supabase Cloud. Approved 8 Nov; needs the DB password, so the owner runs `supabase db push`. Then run the audit query in the migration file | REL-3 |
| HIGH (prod) | The Railway API (`qa-forge-production-7e2b.up.railway.app`) answers "Application not found" (checked 8 Nov): the service is gone or renamed, so nothing serves production API calls. Recreate or reconnect it to this branch (owner, Railway dashboard) | REL-3 |
| HIGH (prod) | Migrations 23 to 25 (step `action` backfill, private screenshots, run/case RLS) not yet applied to Supabase Cloud. The "API first" order no longer blocks it: no old API is running to strip `action` on edit | REL-3 |
| HIGH (prod) | Railway build never installed Chromium, so production runs would end "Browser failed to launch". `nixpacks.toml` now installs it (8 Nov); unverified until Railway builds | REL-3 |
| HIGH (prod) | Screenshots are private locally (EXE-3, mig 24) but the cloud bucket stays public until migration 24 is pushed with 22/23 | REL-3 |
| MED | Seeds still target syedkm.com/example.com, not the demo shop (README/setup guide fixed in DOC-1) | DEMO-1 |
| MED | SSRF guard: WebKit may bypass the proxy for loopback (up-front URL checks still apply). Prod: keep `ALLOW_PRIVATE_HOSTS` unset | SEC-3 (ceiling, TD-8) |
| LOW | 21 `no-explicit-any` lint warnings in `apps/api`; Next.js ESLint plugin not configured | CI-1 |
| LOW | Test files compile into `apps/api/dist` (inert, but shipped) | P1 |
| LOW | Docker Desktop on this Windows host can hang with WSL (6 to 8 Nov; fixed by a reboot). `pnpm check-setup` now detects and explains it | — |
