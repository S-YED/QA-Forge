-- Migration: Create updated_at triggers
-- Description: Creates a single reusable trigger function update_updated_at()
--              and applies it to all 9 tables that have an updated_at column.
--              Tables WITHOUT updated_at (test_runs, test_steps, recorded_sessions,
--              session_actions, sprint_changes, media_attachments) are deliberately
--              excluded.

-- ─── Trigger Function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ─── Apply Triggers ───────────────────────────────────────────────────────────
-- Each trigger fires BEFORE UPDATE to set updated_at to the current timestamp.

-- 1. profiles
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 2. api_keys
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.api_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 3. projects
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 4. test_suites
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.test_suites
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 5. test_cases
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.test_cases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 6. bugs
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.bugs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 7. integrations
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 8. export_schemas
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.export_schemas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 9. app_contexts
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.app_contexts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();
