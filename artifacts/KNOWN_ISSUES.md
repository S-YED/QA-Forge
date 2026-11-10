# Known Issues (open)

Full descriptions: [docs/CURRENT_STATE_AUDIT.md](../docs/CURRENT_STATE_AUDIT.md). Remove rows when the fixing
ticket is **Verified** in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

| Severity | Issue | Ticket |
|---|---|---|
| CRITICAL (prod) | Migration 22 (profile self-escalation fix) not yet applied to Supabase Cloud. Approved 8 Nov; needs the DB password, so the owner runs `supabase db push`. Then run the audit query in the migration file | REL-3 |
| HIGH (prod) | The Railway API (`qa-forge-production-7e2b.up.railway.app`) answers "Application not found" (checked 8 Nov): the service is gone or renamed, so nothing serves production API calls. Recreate or reconnect it to this branch (owner, Railway dashboard) | REL-3 |
| HIGH (prod) | Migrations 23 to 25 (step `action` backfill, private screenshots, run/case RLS) not yet applied to Supabase Cloud. The "API first" order no longer blocks it: no old API is running to strip `action` on edit | REL-3 |
| MED (prod) | The API now deploys from the repo `Dockerfile` (Chromium headless shell included); verified locally in Docker on 10 Nov (production mode, real run passed with screenshots). Not yet built on Railway itself | REL-3 |
| HIGH (prod) | Screenshots are private locally (EXE-3, mig 24) but the cloud bucket stays public until migration 24 is pushed with 22/23 | REL-3 |
| LOW | Windows: a clone under a very deep path (over ~115 characters) fails to start vitest because pnpm paths exceed 260 characters; setup guide says to clone to a short path or enable long paths | REL-1 (documented) |
| LOW | Rare local integration flakes in real-browser run tests: SEC-3 "private host ... as error" (1 of 6 full runs) and RUN-1 "a passing case ends passed" (1 of 4), 8 Nov. Each passed alone and in every rerun; CI green on every push. Ruled out: the dev API's boot reaper (no reaps logged). Cause not found; watch CI | QA-2 |
| HIGH | Recordings cannot record: the viewport is a still image with no click/key forwarding, so no actions are captured (plan A4) | UX |
| MED | No loading feedback on several waits: no loading.tsx, Run/Delete/Refresh/Sign out without pending state, Run can be double-clicked (plan B) | UX |
| MED | Seeds still target syedkm.com/example.com, not the demo shop (README/setup guide fixed in DOC-1) | DEMO-1 |
| MED | SSRF guard: WebKit may bypass the proxy for loopback (up-front URL checks still apply). Prod: keep `ALLOW_PRIVATE_HOSTS` unset | SEC-3 (ceiling, TD-8) |
| LOW | 21 `no-explicit-any` lint warnings in `apps/api`; Next.js ESLint plugin not configured | CI-1 |
| LOW | Test files compile into `apps/api/dist` (inert, but shipped) | P1 |
| LOW | Docker Desktop on this Windows host can hang with WSL (6 to 8 Nov; fixed by a reboot). `pnpm check-setup` now detects and explains it | — |
