-- Migration: Create session_actions table
-- Description: Individual browser actions captured during a recording session.
--              Stores coordinates, selectors, XPaths, and metadata for replaying.
-- NOTE: This table intentionally has NO updated_at column per spec.

CREATE TABLE IF NOT EXISTS public.session_actions (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID        NOT NULL REFERENCES public.recorded_sessions(id) ON DELETE CASCADE,
    action_number  INTEGER     NOT NULL,
    action_type    TEXT        NOT NULL CHECK (action_type IN (
                                    'click', 'dblclick', 'type', 'keypress',
                                    'navigate', 'scroll', 'hover', 'select',
                                    'drag', 'screenshot', 'assert'
                                )),
    selector       TEXT,
    xpath          TEXT,
    coordinates    JSONB,
    value          TEXT,
    url            TEXT,
    timestamp_ms   INTEGER     NOT NULL,
    metadata       JSONB       NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_session_actions_session_number
    ON public.session_actions(session_id, action_number);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.session_actions ENABLE ROW LEVEL SECURITY;

-- Session-child pattern: session_actions → recorded_sessions → user_id (or admin check)
CREATE POLICY "session_actions_select_policy"
    ON public.session_actions
    FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid() OR public.is_admin()
        )
    );

CREATE POLICY "session_actions_insert_policy"
    ON public.session_actions
    FOR INSERT
    WITH CHECK (
        session_id IN (
            SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid() OR public.is_admin()
        )
    );

CREATE POLICY "session_actions_update_policy"
    ON public.session_actions
    FOR UPDATE
    USING (
        session_id IN (
            SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid() OR public.is_admin()
        )
    )
    WITH CHECK (
        session_id IN (
            SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid() OR public.is_admin()
        )
    );

CREATE POLICY "session_actions_delete_policy"
    ON public.session_actions
    FOR DELETE
    USING (
        session_id IN (
            SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid() OR public.is_admin()
        )
    );
