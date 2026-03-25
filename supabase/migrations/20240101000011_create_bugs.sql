-- Migration: Create bugs table
-- Description: Bug reports discovered during or linked to test runs.
--              Supports severity/status tracking, external issue tracker IDs,
--              screenshots, console logs, network errors, and assignment.

CREATE TABLE IF NOT EXISTS public.bugs (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    test_run_id          UUID        REFERENCES public.test_runs(id) ON DELETE SET NULL,
    title                TEXT        NOT NULL,
    description          TEXT,
    steps_to_reproduce   TEXT,
    expected_behavior    TEXT,
    actual_behavior      TEXT,
    severity             TEXT        NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    status               TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')),
    screenshot_urls      TEXT[]      DEFAULT '{}',
    video_url            TEXT,
    console_logs         JSONB       NOT NULL DEFAULT '[]',
    network_errors       JSONB       NOT NULL DEFAULT '[]',
    environment          TEXT,
    browser              TEXT,
    -- assigned_to references profiles but no CASCADE — profile deletions must not
    -- cascade-delete bugs; they should remain with a NULL assignee.
    assigned_to          UUID        REFERENCES public.profiles(id),
    external_id          TEXT,
    external_url         TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bugs_project_status
    ON public.bugs(project_id, status);

CREATE INDEX IF NOT EXISTS idx_bugs_severity
    ON public.bugs(severity);

CREATE INDEX IF NOT EXISTS idx_bugs_test_run_id
    ON public.bugs(test_run_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.bugs ENABLE ROW LEVEL SECURITY;

-- Project-child pattern: bugs → projects → user_id
CREATE POLICY "bugs_select_policy"
    ON public.bugs
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "bugs_insert_policy"
    ON public.bugs
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "bugs_update_policy"
    ON public.bugs
    FOR UPDATE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "bugs_delete_policy"
    ON public.bugs
    FOR DELETE
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );
