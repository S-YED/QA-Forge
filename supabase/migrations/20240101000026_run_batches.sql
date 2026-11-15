-- F3: run a whole suite. A batch groups the runs started together for one suite; each run keeps
-- its own row in test_runs and points back with batch_id. Additive only: existing rows are untouched.

CREATE TABLE IF NOT EXISTS public.run_batches (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    suite_id    UUID        REFERENCES public.test_suites(id) ON DELETE SET NULL,
    user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_batches_project_created
    ON public.run_batches(project_id, created_at DESC);

ALTER TABLE public.test_runs
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.run_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_test_runs_batch_id
    ON public.test_runs(batch_id) WHERE batch_id IS NOT NULL;

-- ─── Row Level Security (same rule as test_runs: the project's owner, acting as themselves) ───

ALTER TABLE public.run_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "run_batches_select_policy" ON public.run_batches;
CREATE POLICY "run_batches_select_policy"
    ON public.run_batches FOR SELECT
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "run_batches_insert_policy" ON public.run_batches;
CREATE POLICY "run_batches_insert_policy"
    ON public.run_batches FOR INSERT
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "run_batches_update_policy" ON public.run_batches;
CREATE POLICY "run_batches_update_policy"
    ON public.run_batches FOR UPDATE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    )
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "run_batches_delete_policy" ON public.run_batches;
CREATE POLICY "run_batches_delete_policy"
    ON public.run_batches FOR DELETE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

-- A run may only point at a batch of its own project (the API uses the service role, but PostgREST
-- callers must not attach their run to someone else's batch).
CREATE OR REPLACE FUNCTION public.batch_in_project(p_batch_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p_batch_id IS NULL OR EXISTS (
    SELECT 1 FROM public.run_batches b WHERE b.id = p_batch_id AND b.project_id = p_project_id
  );
$$;

DROP POLICY IF EXISTS "test_runs_insert_policy" ON public.test_runs;
CREATE POLICY "test_runs_insert_policy"
  ON public.test_runs FOR INSERT
  WITH CHECK (
    (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid()
      AND public.case_in_project(test_case_id, project_id)
      AND public.batch_in_project(batch_id, project_id))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "test_runs_update_policy" ON public.test_runs;
CREATE POLICY "test_runs_update_policy"
  ON public.test_runs FOR UPDATE
  USING (
    (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid()
      AND public.case_in_project(test_case_id, project_id)
      AND public.batch_in_project(batch_id, project_id))
    OR public.is_admin()
  );
