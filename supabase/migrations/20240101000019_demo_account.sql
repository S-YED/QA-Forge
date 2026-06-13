-- Migration: Add demo account infrastructure
-- Description: Adds is_demo flag to profiles, creates demo-specific RLS policies
--              that restrict the demo user to read-only access on all data tables.

-- ── 1. Add is_demo flag to profiles ──────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Helper function: is_demo_user ─────────────────────────────────────────
-- Returns true if the currently authenticated user is the demo account.
-- Used in RLS policies to restrict demo user writes.
CREATE OR REPLACE FUNCTION public.is_demo_user()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_demo = true
    );
END;
$$;

-- ── 3. Demo-restrictive RLS policies ─────────────────────────────────────────
-- Block INSERT/UPDATE/DELETE for the demo user on data tables.
-- SELECT is already allowed by existing ownership policies (not touched here).
-- The demo user's data is assigned to them so existing SELECT policies work.
--
-- CRITICAL: these MUST be `AS RESTRICTIVE`. Postgres combines multiple PERMISSIVE
-- policies for the same command with OR, so a permissive "NOT is_demo_user()"
-- policy would OR with the existing ownership policy (user_id = auth.uid()) and
-- never actually block the demo user from writing their own rows. RESTRICTIVE
-- policies are AND-ed in, so a FALSE here denies the row regardless of what the
-- permissive ownership policies allow.
--
-- NOTE: the API writes with the service_role key, which has BYPASSRLS, so these
-- policies do NOT block legitimate server-side status updates (e.g. marking a
-- run 'running'/'passed'). They only bite direct PostgREST calls made with the
-- demo user's JWT + the public anon key — which is exactly the bypass we are
-- closing (the demo password is public, so the API-layer demoGuard alone is not
-- enough).

-- Projects: block demo writes
CREATE POLICY "projects_demo_no_insert"
    ON public.projects AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());

CREATE POLICY "projects_demo_no_update"
    ON public.projects AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());

CREATE POLICY "projects_demo_no_delete"
    ON public.projects AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Test Suites: block demo writes
CREATE POLICY "test_suites_demo_no_insert"
    ON public.test_suites AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());

CREATE POLICY "test_suites_demo_no_update"
    ON public.test_suites AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());

CREATE POLICY "test_suites_demo_no_delete"
    ON public.test_suites AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Test Cases: block demo writes
CREATE POLICY "test_cases_demo_no_insert"
    ON public.test_cases AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());

CREATE POLICY "test_cases_demo_no_update"
    ON public.test_cases AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());

CREATE POLICY "test_cases_demo_no_delete"
    ON public.test_cases AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Test Runs: block demo writes (server-side status updates use service_role → BYPASSRLS)
CREATE POLICY "test_runs_demo_no_insert"
    ON public.test_runs AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());

CREATE POLICY "test_runs_demo_no_update"
    ON public.test_runs AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());

CREATE POLICY "test_runs_demo_no_delete"
    ON public.test_runs AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Bugs: block demo writes
CREATE POLICY "bugs_demo_no_insert"
    ON public.bugs AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());

CREATE POLICY "bugs_demo_no_update"
    ON public.bugs AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());

CREATE POLICY "bugs_demo_no_delete"
    ON public.bugs AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Profiles: block demo from changing their own profile
CREATE POLICY "profiles_demo_no_update"
    ON public.profiles AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());

-- ── 4. Complete the read-only lockdown on every remaining writable table ──────
-- The demo is meant to be read-only EVERYWHERE, not just on the headline tables.
-- These are also reachable via direct PostgREST with the demo JWT, so they need
-- the same restrictive deny. Tables where the demo owns no rows still get a
-- deny so a minted demo session cannot create any.

-- Test Steps (visible in run detail — must not be vandalizable)
CREATE POLICY "test_steps_demo_no_insert"
    ON public.test_steps AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "test_steps_demo_no_update"
    ON public.test_steps AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "test_steps_demo_no_delete"
    ON public.test_steps AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Recorded Sessions
CREATE POLICY "recorded_sessions_demo_no_insert"
    ON public.recorded_sessions AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "recorded_sessions_demo_no_update"
    ON public.recorded_sessions AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "recorded_sessions_demo_no_delete"
    ON public.recorded_sessions AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Session Actions
CREATE POLICY "session_actions_demo_no_insert"
    ON public.session_actions AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "session_actions_demo_no_update"
    ON public.session_actions AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "session_actions_demo_no_delete"
    ON public.session_actions AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- API Keys (demo must never store provider keys)
CREATE POLICY "api_keys_demo_no_insert"
    ON public.api_keys AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "api_keys_demo_no_update"
    ON public.api_keys AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "api_keys_demo_no_delete"
    ON public.api_keys AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Integrations
CREATE POLICY "integrations_demo_no_insert"
    ON public.integrations AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "integrations_demo_no_update"
    ON public.integrations AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "integrations_demo_no_delete"
    ON public.integrations AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Export Schemas
CREATE POLICY "export_schemas_demo_no_insert"
    ON public.export_schemas AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "export_schemas_demo_no_update"
    ON public.export_schemas AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "export_schemas_demo_no_delete"
    ON public.export_schemas AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- App Contexts
CREATE POLICY "app_contexts_demo_no_insert"
    ON public.app_contexts AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "app_contexts_demo_no_update"
    ON public.app_contexts AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "app_contexts_demo_no_delete"
    ON public.app_contexts AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Sprint Changes
CREATE POLICY "sprint_changes_demo_no_insert"
    ON public.sprint_changes AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "sprint_changes_demo_no_update"
    ON public.sprint_changes AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "sprint_changes_demo_no_delete"
    ON public.sprint_changes AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());

-- Media Attachments
CREATE POLICY "media_attachments_demo_no_insert"
    ON public.media_attachments AS RESTRICTIVE FOR INSERT
    WITH CHECK (NOT public.is_demo_user());
CREATE POLICY "media_attachments_demo_no_update"
    ON public.media_attachments AS RESTRICTIVE FOR UPDATE
    USING (NOT public.is_demo_user());
CREATE POLICY "media_attachments_demo_no_delete"
    ON public.media_attachments AS RESTRICTIVE FOR DELETE
    USING (NOT public.is_demo_user());
