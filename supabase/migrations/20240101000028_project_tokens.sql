-- F8: run a suite from CI. A project token lets a build system start and read suite runs of one
-- project, as the user who created the token. Only a SHA-256 hash of the token is stored; the token
-- itself is shown once, when it is created. Additive only.

CREATE TABLE IF NOT EXISTS public.project_tokens (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    token_hash    TEXT        NOT NULL UNIQUE,
    token_prefix  TEXT        NOT NULL,
    last_used_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_tokens_project ON public.project_tokens(project_id);

-- Row Level Security: the owner of the project, acting as themselves (same rule as test_runs).

ALTER TABLE public.project_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_tokens_select_policy" ON public.project_tokens;
CREATE POLICY "project_tokens_select_policy"
    ON public.project_tokens FOR SELECT
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "project_tokens_insert_policy" ON public.project_tokens;
CREATE POLICY "project_tokens_insert_policy"
    ON public.project_tokens FOR INSERT
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "project_tokens_update_policy" ON public.project_tokens;
CREATE POLICY "project_tokens_update_policy"
    ON public.project_tokens FOR UPDATE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    )
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "project_tokens_delete_policy" ON public.project_tokens;
CREATE POLICY "project_tokens_delete_policy"
    ON public.project_tokens FOR DELETE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );
