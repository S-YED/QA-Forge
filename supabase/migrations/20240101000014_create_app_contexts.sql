-- Migration: Create app_contexts table
-- Description: Stores application context documents (source code, screenshots,
--              PRDs, etc.) with vector embeddings for AI-powered test generation
--              and similarity search via pgvector.

CREATE TABLE IF NOT EXISTS public.app_contexts (
    id          UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID                    NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    type        TEXT                    NOT NULL CHECK (type IN (
                                            'source_code', 'screenshot', 'video',
                                            'text', 'prd', 'changelog'
                                        )),
    name        TEXT                    NOT NULL,
    content     TEXT,
    file_url    TEXT,
    -- vector(1536) matches OpenAI text-embedding-ada-002 / text-embedding-3-small dimensions
    embedding   extensions.vector(1536),
    metadata    JSONB                   NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ             NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Standard B-tree index for project lookup
CREATE INDEX IF NOT EXISTS idx_app_contexts_project_id
    ON public.app_contexts(project_id);

-- HNSW index for fast approximate nearest-neighbour vector similarity search
-- using cosine distance (suitable for normalized OpenAI embeddings)
CREATE INDEX IF NOT EXISTS idx_app_contexts_embedding
    ON public.app_contexts
    USING hnsw (embedding extensions.vector_cosine_ops);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.app_contexts ENABLE ROW LEVEL SECURITY;

-- Project-child pattern: app_contexts → projects → user_id (or admin check)
CREATE POLICY "app_contexts_select_policy"
    ON public.app_contexts
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()
        )
    );

CREATE POLICY "app_contexts_insert_policy"
    ON public.app_contexts
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()
        )
    );

CREATE POLICY "app_contexts_update_policy"
    ON public.app_contexts
    FOR UPDATE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()
        )
    )
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()
        )
    );

CREATE POLICY "app_contexts_delete_policy"
    ON public.app_contexts
    FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()
        )
    );
