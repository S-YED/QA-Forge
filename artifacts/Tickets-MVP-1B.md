# QAForge — Implementation Tickets: MVP-1B

Database Schema & Supabase Setup

---

### TICKET-1B-01: Enable PostgreSQL Extensions

**Status:** Done

**Migration File:** `supabase/migrations/20240101000001_enable_extensions.sql`

**Description:** Enable the three PostgreSQL extensions required by the QAForge schema before any tables are created.

**Key SQL Decisions:**
- `uuid-ossp` in `extensions` schema — provides `uuid_generate_v4()` (though `gen_random_uuid()` is used in most tables, this extension is declared for compatibility)
- `vector` (pgvector) in `extensions` schema — required for `app_contexts.embedding extensions.vector(1536)` and the HNSW index
- `moddatetime` in `extensions` schema — available for automatic timestamp management (the project uses a custom `update_updated_at()` function instead)
- All extensions use `CREATE EXTENSION IF NOT EXISTS` — idempotent, safe to re-run

---

### TICKET-1B-02: Create profiles Table + Auth Trigger

**Status:** Done

**Migration File:** `supabase/migrations/20240101000002_create_profiles.sql`

**Description:** Create the `profiles` table that mirrors `auth.users`, and install the trigger that auto-populates it on every new user signup.

**Key SQL Decisions:**
- `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` — 1:1 with auth.users; deleting the auth user cascades to the profile
- `role TEXT CHECK (role IN ('admin', 'tester', 'viewer')) DEFAULT 'tester'` — inline enum via CHECK constraint
- **RLS policies:** SELECT allows own profile OR admin role; INSERT requires `auth.uid() = id`; UPDATE and DELETE scoped to own row
- **`handle_new_user()` function:** `SECURITY DEFINER` + `SET search_path = public` — required to write to `public.profiles` from the `auth` schema context; extracts `full_name` and `avatar_url` from `NEW.raw_user_meta_data`
- **`on_auth_user_created` trigger:** `AFTER INSERT ON auth.users FOR EACH ROW` — fires automatically on every Supabase Auth signup

---

### TICKET-1B-03: Create api_keys Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000003_create_api_keys.sql`

**Description:** Create the `api_keys` table for storing AES-256-GCM encrypted AI provider API keys.

**Key SQL Decisions:**
- `provider TEXT CHECK (provider IN ('openai', 'anthropic', 'gemini'))` — inline enum
- `encrypted_key TEXT NOT NULL` — stores `iv_hex:authTag_hex:ciphertext_hex`; plaintext never stored
- `key_hint TEXT` — last 4 characters of the raw key; shown in UI as `••••{hint}`
- `is_valid BOOLEAN DEFAULT true` — set to `false` on insert; confirmed only after explicit `/validate` call
- `CONSTRAINT api_keys_user_provider_unique UNIQUE (user_id, provider)` — one key per provider per user
- **RLS:** all 4 policies scoped to `user_id = auth.uid()`

---

### TICKET-1B-04: Create projects Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000004_create_projects.sql`

**Description:** Create the `projects` table — the top-level container for all QAForge testing artifacts.

**Key SQL Decisions:**
- `user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE` — deleting a user cascades to all their projects
- `base_url TEXT` — nullable; used as the default URL for test execution
- Indexes: `idx_projects_user_id` (B-tree) and `idx_projects_created_at DESC` for efficient list queries
- **RLS SELECT policy:** allows own projects OR admin role (admins can see all projects)
- **RLS INSERT/UPDATE/DELETE:** scoped to `user_id = auth.uid()`

---

### TICKET-1B-05: Create test_suites Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000005_create_test_suites.sql`

**Description:** Create the `test_suites` table with self-referential hierarchy support.

**Key SQL Decisions:**
- `parent_suite_id UUID REFERENCES public.test_suites(id) ON DELETE SET NULL` — self-referential FK; `SET NULL` (not CASCADE) so deleting a parent suite does not delete child suites
- `project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE` — deleting a project cascades to all its suites
- Indexes: `idx_test_suites_project_id` and `idx_test_suites_parent_suite_id`
- **RLS:** all policies use a subquery `project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())` — ownership verified via the parent project

---

### TICKET-1B-06: Create test_cases Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000006_create_test_cases.sql`

**Description:** Create the `test_cases` table with rich metadata support for AI-generated and manually authored test cases.

**Key SQL Decisions:**
- `steps JSONB NOT NULL DEFAULT '[]'` — stores structured step objects: `{ step, action, selector, value }`
- `tags TEXT[] DEFAULT '{}'` — PostgreSQL native array for multi-value tags
- `priority TEXT CHECK (priority IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium'`
- `type TEXT CHECK (type IN ('functional', 'regression', 'smoke', 'edge_case', 'accessibility', 'negative')) DEFAULT 'functional'`
- `source TEXT CHECK (source IN ('manual', 'ai_generated', 'recorded')) DEFAULT 'manual'`
- `is_ai_generated BOOLEAN DEFAULT false` — redundant with `source` but kept for fast boolean filtering
- Indexes: `idx_test_cases_suite_id`, `idx_test_cases_type`, `idx_test_cases_priority`
- **RLS:** two-level join — `suite_id IN (SELECT id FROM test_suites WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))`

---

### TICKET-1B-07: Create test_runs Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000007_create_test_runs.sql`

**Description:** Create the `test_runs` table for tracking test execution records.

**Key SQL Decisions:**
- `test_case_id UUID REFERENCES public.test_cases(id) ON DELETE SET NULL` — nullable; `SET NULL` so deleting a test case does not delete its run history
- `status TEXT CHECK (status IN ('pending', 'running', 'passed', 'failed', 'error', 'skipped')) DEFAULT 'pending'`
- `mode TEXT CHECK (mode IN ('ai_driven', 'manual_recording', 'replay')) NOT NULL`
- **No `updated_at` column** — test runs are append-only records; status transitions are tracked via `status` field
- Indexes: `idx_test_runs_project_created` (composite, DESC), `idx_test_runs_user_id`, `idx_test_runs_status`, `idx_test_runs_mode`
- **RLS:** both `project_id` ownership AND `user_id = auth.uid()` required

---

### TICKET-1B-08: Create test_steps Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000008_create_test_steps.sql`

**Description:** Create the `test_steps` table for individual Playwright action records within a test run.

**Key SQL Decisions:**
- `test_run_id UUID NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE` — deleting a run cascades to all its steps
- `status TEXT CHECK (status IN ('pending', 'running', 'passed', 'failed', 'skipped')) NOT NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'` — extensible metadata for future use
- **No `updated_at` column** — steps are written once during execution and never updated
- Index: `idx_test_steps_run_step` (composite on `test_run_id, step_number`) for ordered step retrieval
- **RLS:** `test_run_id IN (SELECT id FROM test_runs WHERE user_id = auth.uid())`

---

### TICKET-1B-09: Create recorded_sessions Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000009_create_recorded_sessions.sql`

**Description:** Create the `recorded_sessions` table for browser recording sessions.

**Key SQL Decisions:**
- `status TEXT CHECK (status IN ('recording', 'completed', 'error')) DEFAULT 'recording'`
- `base_url TEXT NOT NULL` — required; the URL being recorded
- `browser TEXT NOT NULL DEFAULT 'chromium'`
- **No `updated_at` column** — session state is tracked via `status` and `completed_at`
- **RLS:** both `project_id` ownership AND `user_id = auth.uid()` required

---

### TICKET-1B-10: Create session_actions Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000010_create_session_actions.sql`

**Description:** Create the `session_actions` table for individual browser actions captured during a recording session.

**Key SQL Decisions:**
- `action_type TEXT CHECK (action_type IN ('click', 'dblclick', 'type', 'keypress', 'navigate', 'scroll', 'hover', 'select', 'drag', 'screenshot', 'assert')) NOT NULL`
- `coordinates JSONB` — stores `{ x: number, y: number }` for click/scroll actions
- `timestamp_ms INTEGER NOT NULL` — milliseconds from session start for replay ordering
- `metadata JSONB NOT NULL DEFAULT '{}'` — extensible
- **No `updated_at` column** — actions are written once during recording
- Index: `idx_session_actions_session_number` (composite on `session_id, action_number`)
- **RLS:** `session_id IN (SELECT id FROM recorded_sessions WHERE user_id = auth.uid())`

---

### TICKET-1B-11: Create bugs Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000011_create_bugs.sql`

**Description:** Create the `bugs` table for bug reports discovered during or linked to test runs.

**Key SQL Decisions:**
- `test_run_id UUID REFERENCES public.test_runs(id) ON DELETE SET NULL` — nullable; `SET NULL` so deleting a run does not delete its bug reports
- `severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium'`
- `status TEXT CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')) DEFAULT 'open'`
- `screenshot_urls TEXT[] DEFAULT '{}'` — array of screenshot URLs
- `console_logs JSONB NOT NULL DEFAULT '[]'` and `network_errors JSONB NOT NULL DEFAULT '[]'` — structured log storage
- `assigned_to UUID REFERENCES public.profiles(id)` — **no ON DELETE CASCADE** — profile deletions must not cascade-delete bugs; they remain with `NULL` assignee
- `external_id TEXT` and `external_url TEXT` — for Jira/GitHub issue linking
- Indexes: `idx_bugs_project_status` (composite), `idx_bugs_severity`, `idx_bugs_test_run_id`
- **RLS:** `project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())`

---

### TICKET-1B-12: Create integrations Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000012_create_integrations.sql`

**Description:** Create the `integrations` table for third-party integration configurations.

**Key SQL Decisions:**
- `provider TEXT CHECK (provider IN ('jira', 'testrail', 'notion', 'github')) NOT NULL`
- `project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE` — nullable for global (user-wide) integrations
- `config JSONB NOT NULL DEFAULT '{}'` — provider-specific configuration (credentials, URLs, etc.)
- **`COALESCE` unique index** instead of standard `UNIQUE(user_id, project_id, provider)` — standard UNIQUE fails when `project_id IS NULL` because `NULL != NULL` in SQL; `COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)` uses a sentinel UUID to enforce uniqueness correctly
- **RLS:** `user_id = auth.uid()` (direct ownership)

---

### TICKET-1B-13: Create export_schemas Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000013_create_export_schemas.sql`

**Description:** Create the `export_schemas` table for user-defined test report export configurations.

**Key SQL Decisions:**
- `columns JSONB NOT NULL` — defines the column structure for the export format
- `project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE` — nullable for global schemas
- `is_default BOOLEAN DEFAULT false` — marks the default schema for a user/project
- `template_file_url TEXT` — optional URL to a template file (e.g., Excel template)
- **RLS:** `user_id = auth.uid()` (direct ownership)

---

### TICKET-1B-14: Create app_contexts Table (with pgvector)

**Status:** Done

**Migration File:** `supabase/migrations/20240101000014_create_app_contexts.sql`

**Description:** Create the `app_contexts` table for storing application context documents with vector embeddings for AI-powered test generation.

**Key SQL Decisions:**
- `embedding extensions.vector(1536)` — 1536 dimensions matches OpenAI `text-embedding-ada-002` and `text-embedding-3-small`; nullable (embedding generated asynchronously after upload)
- `type TEXT CHECK (type IN ('source_code', 'screenshot', 'video', 'text', 'prd', 'changelog')) NOT NULL`
- **HNSW index:** `USING hnsw (embedding extensions.vector_cosine_ops)` — Hierarchical Navigable Small World index for fast approximate nearest-neighbour search; cosine distance is appropriate for normalized OpenAI embeddings
- Standard B-tree index on `project_id` for non-vector queries
- **RLS:** `project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())`

---

### TICKET-1B-15: Create sprint_changes Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000015_create_sprint_changes.sql`

**Description:** Create the `sprint_changes` table for capturing sprint-level change descriptions to help AI regenerate test cases when the application evolves.

**Key SQL Decisions:**
- `changes_description TEXT NOT NULL` — free-text description of what changed in the sprint
- `affected_areas TEXT[] DEFAULT '{}'` — array of affected feature areas for filtering
- `sprint_name TEXT` — nullable; not all teams use sprint names
- **No `updated_at` column** — sprint changes are append-only records
- **RLS:** both `project_id` ownership AND `user_id = auth.uid()` required

---

### TICKET-1B-16: Create media_attachments Table

**Status:** Done

**Migration File:** `supabase/migrations/20240101000016_create_media_attachments.sql`

**Description:** Create the `media_attachments` polymorphic table for storing media files attached to any entity.

**Key SQL Decisions:**
- `entity_type TEXT CHECK (entity_type IN ('test_run', 'test_step', 'bug', 'recorded_session')) NOT NULL` — discriminator column
- `entity_id UUID NOT NULL` — **no FK constraint** — PostgreSQL cannot enforce FK constraints on polymorphic references; the application layer enforces referential integrity
- `type TEXT CHECK (type IN ('screenshot', 'video', 'log', 'trace', 'har')) NOT NULL`
- **No `updated_at` column** — attachments are uploaded once and not modified
- Index: `idx_media_attachments_entity` (composite on `entity_type, entity_id`)
- **Polymorphic RLS:** SELECT/INSERT/UPDATE/DELETE policies branch on `entity_type` with separate subqueries for each entity type

---

### TICKET-1B-17: Create updated_at Triggers

**Status:** Done

**Migration File:** `supabase/migrations/20240101000017_create_updated_at_triggers.sql`

**Description:** Create a single reusable trigger function and apply it to all tables that have an `updated_at` column.

**Key SQL Decisions:**
- `update_updated_at()` function: `NEW.updated_at = now(); RETURN NEW;` — simple, reusable
- Applied to 9 tables: `profiles`, `api_keys`, `projects`, `test_suites`, `test_cases`, `bugs`, `integrations`, `export_schemas`, `app_contexts`
- **Deliberately excluded** (no `updated_at` column): `test_runs`, `test_steps`, `recorded_sessions`, `session_actions`, `sprint_changes`, `media_attachments` — these are append-only records
- `CREATE OR REPLACE TRIGGER set_updated_at BEFORE UPDATE` — fires before each UPDATE, sets `updated_at` to `now()`

---

### TICKET-1B-18: Write Seed Data

**Status:** Done

**File:** `supabase/seed.sql`

**Description:** Write comprehensive seed data with fixed UUIDs for fully reproducible local development. Applied automatically by `supabase db reset`.

**Key Decisions:**
- Fixed UUID constants via `\set` psql variables — ensures the same IDs on every reset, making debugging reproducible
- `INSERT INTO auth.users` with `crypt('Password123!', gen_salt('bf'))` — bcrypt-hashed passwords; the `handle_new_user()` trigger auto-creates profile rows
- Alice promoted to `admin` role via `UPDATE public.profiles SET role = 'admin'` after trigger fires
- All inserts use `ON CONFLICT (id) DO NOTHING` — safe to run multiple times
- Seed creates: 2 users, 2 projects, 2 suites (one nested), 3 test cases (2 manual + 1 AI-generated), 2 test runs (1 passed + 1 failed), 5 test steps for the passed run, 1 recorded session

---

### TICKET-1B-19: Write shared-types database.ts, enums.ts, api.ts, websocket.ts

**Status:** Done

**Files:**
- `packages/shared-types/src/database.ts` — interfaces: `Profile`, `ApiKey`, `Project`, `TestRun`, `TestStep`, `RecordedSession`, `SessionAction`
- `packages/shared-types/src/enums.ts` — enums: `TestRunStatus`, `TestRunMode`, `TestStepStatus`, `ActionType`, `ApiKeyProvider`, `UserRole`, `SessionStatus`, `BugSeverity`, `BugStatus`
- `packages/shared-types/src/api.ts` — DTOs: `LoginRequest`, `RegisterRequest`, `AuthResponse`, `CreateProjectRequest`, `UpdateProjectRequest`, `CreateApiKeyRequest`, `ApiKeyResponse` (= `Omit<ApiKey, 'encrypted_key'>`), `CreateTestRunRequest`, `PaginatedResponse<T>`, `ApiError`
- `packages/shared-types/src/websocket.ts` — Socket.io event types: `TestStepStartEvent`, `TestStepCompleteEvent`, `TestScreenshotEvent`, `TestCompleteEvent`, `RecordingActionEvent`, `SessionFrameEvent`

**Key Decision:** `ApiKeyResponse = Omit<ApiKey, 'encrypted_key'>` — the type system enforces that `encrypted_key` is never included in API responses; any route that accidentally selects `encrypted_key` will fail TypeScript compilation.

---

### TICKET-1B-20: Write supabase/SETUP.md

**Status:** Done

**File:** `supabase/SETUP.md`

**Description:** Write a comprehensive setup guide for the Supabase local development environment, covering prerequisites, startup commands, environment variable configuration, and troubleshooting.
