# Known Issues (open)

Full descriptions: [docs/CURRENT_STATE_AUDIT.md](../docs/CURRENT_STATE_AUDIT.md). Remove rows when the fixing
ticket is **Verified** in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

| Severity | Issue | Ticket |
|---|---|---|
| CRITICAL (prod) | Migration 22 (profile self-escalation fix) not yet applied to Supabase Cloud. Run the audit query in the migration file after applying | SEC-1 deploy, owner approval |
| HIGH (prod) | Optimize IDOR fix not yet deployed to Railway | SEC-2 deploy, owner approval |
| HIGH (prod) | Migration 23 (step `action` backfill) not yet applied to Supabase Cloud; until then prod cases fail validation on edit. **Order: deploy the API first, then run mig 23** (the old API's step schema strips unknown keys, so edits would drop `action`) | CON-2 deploy, owner approval |
| HIGH | Screenshots in a public bucket | EXE-3 |
| MED | SSRF guard verified in the runner; API integration run pending Docker. Prod: keep `ALLOW_PRIVATE_HOSTS` unset/empty on Railway. WebKit may bypass the proxy for loopback (up-front URL checks still apply) | SEC-3 |
| HIGH | AI output is validated (AI-1) but still saved without a human review step | AI-2 |
| MED | Runs stuck `running` after an API restart: fix implemented, integration test pending a working Docker engine | EXE-2 |
| MED | Refresh mid-run: fix built (live for pending/running, ack then reload on join/reconnect), not yet checked in a browser | UI-1 |
| MED | Manual step editor and run-detail `instruction` display not yet checked in a browser (type-checked and built only) | UI-2 / QA-3 |
| MED | Env templates/docs use the wrong key names; no setup script; seeds still target syedkm.com/example.com, not the demo app | DX-1, DX-2, DEMO-1 |
| MED | Local demo generation (`AI_LOCAL_DEMO`) fallback in the generate route not yet integration-tested (fixtures and runner verified) | AI-3 |
| MED | `test_runs` RLS doesn't tie case to project; `bugs.assigned_to` blocks profile delete | S6 |
| LOW | 21 `no-explicit-any` lint warnings in `apps/api`; Next.js ESLint plugin not configured | CI-1 |
| LOW | Test files compile into `apps/api/dist` (inert, but shipped) | P1 |
| LOW | Integration tests need a healthy Docker engine. On 6 Nov WSL stopped answering (`wsl --status` hangs) and Docker Desktop exits; before the WSL restart, Chromium also could not reach 127.0.0.1 (all browser tests timed out). Likely needs a Windows reboot, then `supabase start` | DX-2 (`pnpm doctor` should detect it) |
