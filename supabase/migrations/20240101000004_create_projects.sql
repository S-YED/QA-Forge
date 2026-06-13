-- Migration: Create projects table
-- Description: Top-level container for all QAForge testing artifacts.
--              Users own their projects directly.

CREATE TABLE IF NOT EXISTS public.projects (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT,
    base_url    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_user_id
    ON public.projects(user_id);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
    ON public.projects(created_at DESC);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only see their own projects; admins can see all projects
CREATE POLICY "projects_select_policy"
    ON public.projects
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- INSERT: Users can create projects for themselves; admins can create projects for anyone
CREATE POLICY "projects_insert_policy"
    ON public.projects
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- UPDATE: Users can update their own projects; admins can update any project
CREATE POLICY "projects_update_policy"
    ON public.projects
    FOR UPDATE
    USING (
        user_id = auth.uid()
        OR public.is_admin()
    )
    WITH CHECK (
        user_id = auth.uid()
        OR public.is_admin()
    );

-- DELETE: Users can delete their own projects; admins can delete any project
CREATE POLICY "projects_delete_policy"
    ON public.projects
    FOR DELETE
    USING (
        user_id = auth.uid()
        OR public.is_admin()
    );
