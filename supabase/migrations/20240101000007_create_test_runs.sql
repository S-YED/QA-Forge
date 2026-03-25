-- Migration: Create test_runs table
-- Description: Execution records for test cases. Tracks status, timing, browser,
--              environment, and optional AI/manual recording mode.
-- NOTE: This table intentionally has NO updated_at column per spec.

CREATE TABLE IF NOT EXISTS public.test_runs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    test_case_id   UUID        REFERENCES public.test_cases(id) ON DELETE SET NULL,
    project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'passed', 'failed', 'error', 'skipped')),
    mode           TEXT        NOT NULL CHECK (mode IN ('ai_driven', 'manual_recording', 'replay')),
    browser        TEXT        NOT NULL DEFAULT 'chromium',
    environment    TEXT        NOT NULL DEFAULT 'local',
    duration_ms    INTEGER,
    error_message  TEXT,
    video_url      TEXT,
    nl_input       TEXT,
    started_at     TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_test_runs_project_created
    ON public.test_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_runs_user_id
    ON public.test_runs(user_id);

CREATE INDEX IF NOT EXISTS idx_test_runs_status
    ON public.test_runs(status);

CREATE INDEX IF NOT EXISTS idx_test_runs_mode
    ON public.test_runs(mode);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;

-- Project ownership verified via projects table; user_id is an additional constraint
CREATE POLICY "test_runs_select_policy"
    ON public.test_runs
    FOR SELECT
    USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );

CREATE POLICY "test_runs_insert_policy"
    ON public.test_runs
    FOR INSERT
    WITH CHECK (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );

CREATE POLICY "test_runs_update_policy"
    ON public.test_runs
    FOR UPDATE
    USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    )
    WITH CHECK (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );

CREATE POLICY "test_runs_delete_policy"
    ON public.test_runs
    FOR DELETE
    USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
        AND user_id = auth.uid()
    );
