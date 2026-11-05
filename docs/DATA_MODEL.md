# Data Model (22 migrations in `supabase/migrations/`, audited 5 Nov 2026)

All 15 tables have RLS enabled. Every policy also allows `public.is_admin()` (a SECURITY DEFINER read of
`profiles.role`). The API uses the service-role key and **bypasses RLS**; RLS and column grants protect direct
PostgREST access with the public key.

| Table | FKs (ON DELETE) | Key constraints | Ownership in RLS |
|---|---|---|---|
| profiles | id → auth.users CASCADE | role ∈ admin/tester/viewer; `is_demo` (mig 19) | `auth.uid() = id`; **mig 22: clients may only UPDATE `full_name, avatar_url`; no client INSERT/DELETE** |
| api_keys | user_id → profiles CASCADE | UNIQUE(user_id, provider); provider ∈ openai/anthropic/gemini/openrouter | user_id |
| projects | user_id → profiles CASCADE | — | user_id |
| test_suites | project_id CASCADE; parent_suite_id SET NULL | — | via projects |
| test_cases | suite_id CASCADE | priority, type, source CHECKs; `steps` JSONB | via suites → projects |
| test_runs | test_case_id SET NULL; project_id, user_id CASCADE | status ∈ pending/running/passed/failed/error/skipped; mode ∈ ai_driven/manual_recording/replay | projects.user_id AND user_id |
| test_steps | test_run_id CASCADE | status ∈ pending/running/passed/failed/skipped (no `error`); `action` NOT NULL; no UNIQUE(run, step_number) | via test_runs.user_id |
| bugs | project_id CASCADE; test_run_id SET NULL; assigned_to → profiles (**NO ACTION**) | severity, status CHECKs | via projects |
| recorded_sessions, session_actions | CASCADE | status / action_type CHECKs | user_id (deferred feature) |
| integrations, export_schemas, app_contexts (pgvector HNSW), sprint_changes, media_attachments | CASCADE | — | user_id / projects (deferred features) |

Storage: bucket `test-artifacts` (mig 20) is **public** with an anonymous SELECT policy (to be made private, EXE-3).

## Canonical test-case step (`test_cases.steps[]`)
Current: `{ step_number, instruction, selector?, value?, expected? }`. The action is guessed from `instruction` text.
Target (CON-1/CON-2, decided 5 Nov): add a required `action` enum (navigate, click, fill, select, hover, press,
wait_for, assert_visible, assert_text, assert_url, scroll). `instruction` remains the human description.

## Known schema issues
- `test_runs` RLS doesn't check that `test_case_id` belongs to `project_id` (S6).
- `bugs.assigned_to` has no ON DELETE: deleting an assigned profile is blocked (its comment says SET NULL).
- `bugs.steps_to_reproduce` uses a `{step, description}` shape that differs from test steps.
- No atomic run-claim function (the executor will use a conditional UPDATE; no RPC is needed).

## Functions and triggers
`is_admin()`, `is_demo_user()` (SECURITY DEFINER), `handle_new_user()` (auth.users AFTER INSERT → profiles),
`update_updated_at` / moddatetime triggers (mig 17), performance indices (mig 18).
