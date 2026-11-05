# Known Issues (open)

Full descriptions: [docs/CURRENT_STATE_AUDIT.md](../docs/CURRENT_STATE_AUDIT.md). Remove rows when the fixing
ticket is **Verified** in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

| Severity | Issue | Ticket |
|---|---|---|
| CRITICAL (prod) | Migration 22 (profile self-escalation fix) not yet applied to Supabase Cloud. Run the audit query in the migration file after applying | SEC-1 deploy, owner approval |
| HIGH (prod) | Optimize IDOR fix not yet deployed to Railway | SEC-2 deploy, owner approval |
| HIGH (prod) | Migration 23 (step `action` backfill) not yet applied to Supabase Cloud; until then prod cases fail validation on edit. **Order: deploy the API first, then run mig 23** (the old API's step schema strips unknown keys, so edits would drop `action`) | CON-2 deploy, owner approval |
| HIGH | Duplicate execution race; `test.handler` still swallows its own DB/storage write errors (the runner now treats a throwing callback as `error`, but the handler catches first) | EXE-1 |
| HIGH | Screenshots in a public bucket | EXE-3 |
| HIGH | No SSRF guard on base_url / navigate / recording | SEC-3 |
| HIGH | AI output saved without review or validation | AI-1, AI-2 |
| MED | Runs stuck `running` after an API restart | EXE-2 |
| MED | Refresh mid-run shows a scripted replay, not live state | UI-1 |
| MED | Manual step editor and run-detail `instruction` display not yet checked in a browser (type-checked and built only) | UI-2 / QA-3 |
| LOW | Run-time `nl_input` path still executes unreviewed AI steps (now contract-validated) | EXE-1 / AI-2 |
| MED | Env templates/docs use the wrong key names; no setup script; no demo target | DX-1, DX-2, DEMO-1 |
| MED | `test_runs` RLS doesn't tie case to project; `bugs.assigned_to` blocks profile delete | S6 |
| LOW | 21 `no-explicit-any` lint warnings in `apps/api`; Next.js ESLint plugin not configured | CI-1 |
| LOW | Test files compile into `apps/api/dist` (inert, but shipped) | P1 |
