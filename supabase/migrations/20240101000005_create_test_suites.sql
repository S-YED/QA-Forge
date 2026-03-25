-- Migration: Create test_suites table
-- Description: Organizes test cases into hierarchical suites.
--              Supports nested suites via the self-referencing parent_suite_id FK.

CREATE TABLE IF NOT EXISTS public.test_suites (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    parent_suite_id UUID        REFERENCES public.test_suites(id) ON DELETE SET NULL,
    name            TEXT        NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_test_suites_project_id
    ON public.test_suites(project_id);

CREATE INDEX IF NOT EXISTS idx_test_suites_parent_suite_id
    ON public.test_suites(parent_suite_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.test_suites ENABLE ROW LEVEL SECURITY;

-- SELECT: Accessible if the parent project belongs to the current user
CREATE POLICY "test_suites_select_policy"
    ON public.test_suites
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

-- INSERT: Only allowed if the parent project belongs to the current user
CREATE POLICY "test_suites_insert_policy"
    ON public.test_suites
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

-- UPDATE: Only allowed if the parent project belongs to the current user
CREATE POLICY "test_suites_update_policy"
    ON public.test_suites
    FOR UPDATE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

-- DELETE: Only allowed if the parent project belongs to the current user
CREATE POLICY "test_suites_delete_policy"
    ON public.test_suites
    FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );
