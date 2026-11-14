-- =============================================================================
-- Migration 25: test_runs must reference a case of their own project; deleting a
-- profile un-assigns its bugs instead of being blocked (S6)
-- =============================================================================
-- 1. The insert/update policies on test_runs checked project ownership but not that
--    test_case_id belongs to that project, so a user writing through PostgREST could
--    point a run in their own project at another user's test case. The API already
--    scopes this; the database now enforces it too.
-- 2. bugs.assigned_to had no ON DELETE action, which blocked deleting a profile. The
--    original intent (migration 11) was "bugs remain with a NULL assignee".
-- =============================================================================

ALTER TABLE public.bugs
  DROP CONSTRAINT IF EXISTS bugs_assigned_to_fkey,
  ADD CONSTRAINT bugs_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- A run's case (when it has one) must live in a suite of the run's project. SECURITY INVOKER:
-- under the caller's RLS another user's case is invisible, so it fails the check.
CREATE OR REPLACE FUNCTION public.case_in_project(p_case_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p_case_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.test_cases tc
    JOIN public.test_suites s ON s.id = tc.suite_id
    WHERE tc.id = p_case_id AND s.project_id = p_project_id
  );
$$;

DROP POLICY IF EXISTS "test_runs_insert_policy" ON public.test_runs;
CREATE POLICY "test_runs_insert_policy"
  ON public.test_runs FOR INSERT
  WITH CHECK (
    (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid()
      AND public.case_in_project(test_case_id, project_id))
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
      AND public.case_in_project(test_case_id, project_id))
    OR public.is_admin()
  );
