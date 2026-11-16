-- F10: where a project sends a notice when a suite run ends with failures. One row per project,
-- holding its Slack incoming-webhook address encrypted by the API (same key as AI keys and project
-- secrets). The address is a credential: the API never returns it. Additive only.

CREATE TABLE IF NOT EXISTS public.project_notifications (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id               UUID        NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id                  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    slack_webhook_encrypted  TEXT        NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security: the owner of the project, acting as themselves (same rule as suite_schedules).

ALTER TABLE public.project_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_notifications_select_policy" ON public.project_notifications;
CREATE POLICY "project_notifications_select_policy"
    ON public.project_notifications FOR SELECT
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "project_notifications_insert_policy" ON public.project_notifications;
CREATE POLICY "project_notifications_insert_policy"
    ON public.project_notifications FOR INSERT
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "project_notifications_update_policy" ON public.project_notifications;
CREATE POLICY "project_notifications_update_policy"
    ON public.project_notifications FOR UPDATE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    )
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

DROP POLICY IF EXISTS "project_notifications_delete_policy" ON public.project_notifications;
CREATE POLICY "project_notifications_delete_policy"
    ON public.project_notifications FOR DELETE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );
