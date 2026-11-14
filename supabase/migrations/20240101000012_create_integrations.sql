-- Migration: Create integrations table
-- Description: Stores third-party integration configurations (Jira, TestRail, etc.)
--              per user, optionally scoped to a specific project.
--              A unique partial index handles the nullable project_id correctly.

CREATE TABLE IF NOT EXISTS public.integrations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- project_id is nullable for global (user-wide) integrations
    project_id  UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
    provider    TEXT        NOT NULL CHECK (provider IN ('jira', 'testrail', 'notion', 'github')),
    config      JSONB       NOT NULL DEFAULT '{}',
    is_active   BOOLEAN     DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Standard UNIQUE(user_id, project_id, provider) won't work correctly when
-- project_id IS NULL (NULL != NULL in SQL). Use COALESCE with a sentinel UUID
-- to enforce uniqueness across both project-scoped and global integrations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_unique
    ON public.integrations (
        user_id,
        COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
        provider
    );

-- B-tree index on project_id for faster JOINs and cascade deletions
CREATE INDEX IF NOT EXISTS idx_integrations_project_id
    ON public.integrations(project_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Direct ownership via user_id (or admin check)
CREATE POLICY "integrations_select_policy"
    ON public.integrations
    FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "integrations_insert_policy"
    ON public.integrations
    FOR INSERT
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "integrations_update_policy"
    ON public.integrations
    FOR UPDATE
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "integrations_delete_policy"
    ON public.integrations
    FOR DELETE
    USING (user_id = auth.uid() OR public.is_admin());
