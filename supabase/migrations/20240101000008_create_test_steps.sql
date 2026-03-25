-- Migration: Create test_steps table
-- Description: Individual step records within a test run. Each step captures
--              one Playwright action, its outcome, screenshot, and metadata.
-- NOTE: This table intentionally has NO updated_at column per spec.

CREATE TABLE IF NOT EXISTS public.test_steps (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id     UUID        NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
    step_number     INTEGER     NOT NULL,
    action          TEXT        NOT NULL,
    selector        TEXT,
    value           TEXT,
    status          TEXT        NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed', 'skipped')),
    screenshot_url  TEXT,
    error_message   TEXT,
    duration_ms     INTEGER,
    metadata        JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_test_steps_run_step
    ON public.test_steps(test_run_id, step_number);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.test_steps ENABLE ROW LEVEL SECURITY;

-- Run-child pattern: test_steps → test_runs → user_id
CREATE POLICY "test_steps_select_policy"
    ON public.test_steps
    FOR SELECT
    USING (
        test_run_id IN (
            SELECT id FROM public.test_runs WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "test_steps_insert_policy"
    ON public.test_steps
    FOR INSERT
    WITH CHECK (
        test_run_id IN (
            SELECT id FROM public.test_runs WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "test_steps_update_policy"
    ON public.test_steps
    FOR UPDATE
    USING (
        test_run_id IN (
            SELECT id FROM public.test_runs WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        test_run_id IN (
            SELECT id FROM public.test_runs WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "test_steps_delete_policy"
    ON public.test_steps
    FOR DELETE
    USING (
        test_run_id IN (
            SELECT id FROM public.test_runs WHERE user_id = auth.uid()
        )
    );
