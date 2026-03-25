-- Migration: Create sprint_changes table
-- Description: Captures sprint-level change descriptions to help AI regenerate
--              or update test cases when the application evolves.
-- NOTE: This table intentionally has NO updated_at column per spec.

CREATE TABLE IF NOT EXISTS public.sprint_changes (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id              UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sprint_name          TEXT,
    changes_description  TEXT        NOT NULL,
    affected_areas       TEXT[]      DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.sprint_changes ENABLE ROW LEVEL SECURITY;

-- Project ownership verified via projects table; user_id is an additional constraint
CREATE POLICY "sprint_changes_select_policy"
    ON public.sprint_changes
    FOR SELECT
    USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );

CREATE POLICY "sprint_changes_insert_policy"
    ON public.sprint_changes
    FOR INSERT
    WITH CHECK (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );

CREATE POLICY "sprint_changes_update_policy"
    ON public.sprint_changes
    FOR UPDATE
    USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    )
    WITH CHECK (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );

CREATE POLICY "sprint_changes_delete_policy"
    ON public.sprint_changes
    FOR DELETE
    USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );
