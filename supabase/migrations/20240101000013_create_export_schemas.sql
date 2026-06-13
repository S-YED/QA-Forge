-- Migration: Create export_schemas table
-- Description: Stores user-defined export schema configurations for generating
--              test reports in various formats. Can be global or project-scoped.

CREATE TABLE IF NOT EXISTS public.export_schemas (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- project_id is nullable for global export schemas
    project_id        UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
    name              TEXT        NOT NULL,
    description       TEXT,
    columns           JSONB       NOT NULL,
    template_file_url TEXT,
    is_default        BOOLEAN     DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_export_schemas_user_id
    ON public.export_schemas(user_id);

CREATE INDEX IF NOT EXISTS idx_export_schemas_project_id
    ON public.export_schemas(project_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.export_schemas ENABLE ROW LEVEL SECURITY;

-- Direct ownership via user_id (or admin check)
CREATE POLICY "export_schemas_select_policy"
    ON public.export_schemas
    FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "export_schemas_insert_policy"
    ON public.export_schemas
    FOR INSERT
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "export_schemas_update_policy"
    ON public.export_schemas
    FOR UPDATE
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "export_schemas_delete_policy"
    ON public.export_schemas
    FOR DELETE
    USING (user_id = auth.uid() OR public.is_admin());
