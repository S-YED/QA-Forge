-- F9: scheduled suite runs. One schedule per suite: daily or weekly, at an hour in a timezone.
-- The API claims a due schedule by moving next_run_at forward in one conditional UPDATE, so a
-- restart or a second API instance never runs the same slot twice. Additive only.

CREATE TABLE IF NOT EXISTS public.suite_schedules (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    suite_id       UUID        NOT NULL UNIQUE REFERENCES public.test_suites(id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    frequency      TEXT        NOT NULL CHECK (frequency IN ('daily', 'weekly')),
    hour           SMALLINT    NOT NULL CHECK (hour BETWEEN 0 AND 23),
    weekday        SMALLINT    CHECK (weekday BETWEEN 0 AND 6),
    timezone       TEXT        NOT NULL DEFAULT 'UTC',
    enabled        BOOLEAN     NOT NULL DEFAULT true,
    next_run_at    TIMESTAMPTZ NOT NULL,
    last_run_at    TIMESTAMPTZ,
    last_batch_id  UUID        REFERENCES public.run_batches(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (frequency = 'daily' OR weekday IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_suite_schedules_due ON public.suite_schedules(next_run_at) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_suite_schedules_project ON public.suite_schedules(project_id);

-- Row Level Security: the owner of the project, acting as themselves (same rule as test_runs).

ALTER TABLE public.suite_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suite_schedules_select_policy" ON public.suite_schedules;
CREATE POLICY "suite_schedules_select_policy"
    ON public.suite_schedules FOR SELECT
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "suite_schedules_insert_policy" ON public.suite_schedules;
CREATE POLICY "suite_schedules_insert_policy"
    ON public.suite_schedules FOR INSERT
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "suite_schedules_update_policy" ON public.suite_schedules;
CREATE POLICY "suite_schedules_update_policy"
    ON public.suite_schedules FOR UPDATE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    )
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "suite_schedules_delete_policy" ON public.suite_schedules;
CREATE POLICY "suite_schedules_delete_policy"
    ON public.suite_schedules FOR DELETE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );
