-- F4: project variables and secrets. A step uses one as {{NAME}}; the API resolves it just before
-- the run. Values are encrypted by the API (same key as stored AI keys) and never leave it for
-- secret variables. Additive only.

CREATE TABLE IF NOT EXISTS public.project_variables (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name             TEXT        NOT NULL CHECK (name ~ '^[A-Z][A-Z0-9_]{0,63}$'),
    value_encrypted  TEXT        NOT NULL,
    is_secret        BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

DROP TRIGGER IF EXISTS project_variables_updated_at ON public.project_variables;
CREATE TRIGGER project_variables_updated_at
    BEFORE UPDATE ON public.project_variables
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Row Level Security: the owner of the parent project (or an admin), like test_suites.

ALTER TABLE public.project_variables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_variables_select_policy" ON public.project_variables;
CREATE POLICY "project_variables_select_policy"
    ON public.project_variables FOR SELECT
    USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "project_variables_insert_policy" ON public.project_variables;
CREATE POLICY "project_variables_insert_policy"
    ON public.project_variables FOR INSERT
    WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "project_variables_update_policy" ON public.project_variables;
CREATE POLICY "project_variables_update_policy"
    ON public.project_variables FOR UPDATE
    USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()))
    WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()));

DROP POLICY IF EXISTS "project_variables_delete_policy" ON public.project_variables;
CREATE POLICY "project_variables_delete_policy"
    ON public.project_variables FOR DELETE
    USING (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid() OR public.is_admin()));
