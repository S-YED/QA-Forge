-- Migration: Create recorded_sessions table
-- Description: Browser recording sessions. When a user records interactions,
--              they are stored here. Session actions are stored in session_actions.
-- NOTE: This table intentionally has NO updated_at column per spec.

CREATE TABLE IF NOT EXISTS public.recorded_sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    description  TEXT,
    base_url     TEXT        NOT NULL,
    browser      TEXT        NOT NULL DEFAULT 'chromium',
    status       TEXT        NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'completed', 'error')),
    video_url    TEXT,
    duration_ms  INTEGER,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_recorded_sessions_project_id
    ON public.recorded_sessions(project_id);

CREATE INDEX IF NOT EXISTS idx_recorded_sessions_user_id
    ON public.recorded_sessions(user_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.recorded_sessions ENABLE ROW LEVEL SECURITY;

-- Project ownership verified via projects table; user_id is an additional constraint (or admin check)
CREATE POLICY "recorded_sessions_select_policy"
    ON public.recorded_sessions
    FOR SELECT
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "recorded_sessions_insert_policy"
    ON public.recorded_sessions
    FOR INSERT
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "recorded_sessions_update_policy"
    ON public.recorded_sessions
    FOR UPDATE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    )
    WITH CHECK (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "recorded_sessions_delete_policy"
    ON public.recorded_sessions
    FOR DELETE
    USING (
        (project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid()) AND user_id = auth.uid())
        OR public.is_admin()
    );
