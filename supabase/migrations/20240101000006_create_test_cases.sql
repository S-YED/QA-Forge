-- Migration: Create test_cases table
-- Description: Individual test cases belonging to test suites.
--              Supports AI-generated cases, tags, JSONB steps, and rich metadata.

CREATE TABLE IF NOT EXISTS public.test_cases (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id         UUID        NOT NULL REFERENCES public.test_suites(id) ON DELETE CASCADE,
    title            TEXT        NOT NULL,
    description      TEXT,
    steps            JSONB       NOT NULL DEFAULT '[]',
    expected_result  TEXT,
    priority         TEXT        DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    type             TEXT        DEFAULT 'functional' CHECK (type IN ('functional', 'regression', 'smoke', 'edge_case', 'accessibility', 'negative')),
    tags             TEXT[]      DEFAULT '{}',
    is_ai_generated  BOOLEAN     DEFAULT false,
    source           TEXT        DEFAULT 'manual' CHECK (source IN ('manual', 'ai_generated', 'recorded')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_test_cases_suite_id
    ON public.test_cases(suite_id);

CREATE INDEX IF NOT EXISTS idx_test_cases_type
    ON public.test_cases(type);

CREATE INDEX IF NOT EXISTS idx_test_cases_priority
    ON public.test_cases(priority);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;

-- Two-level join: test_cases → test_suites → projects → user_id
CREATE POLICY "test_cases_select_policy"
    ON public.test_cases
    FOR SELECT
    USING (
        suite_id IN (
            SELECT id FROM public.test_suites
            WHERE project_id IN (
                SELECT id FROM public.projects WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "test_cases_insert_policy"
    ON public.test_cases
    FOR INSERT
    WITH CHECK (
        suite_id IN (
            SELECT id FROM public.test_suites
            WHERE project_id IN (
                SELECT id FROM public.projects WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "test_cases_update_policy"
    ON public.test_cases
    FOR UPDATE
    USING (
        suite_id IN (
            SELECT id FROM public.test_suites
            WHERE project_id IN (
                SELECT id FROM public.projects WHERE user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        suite_id IN (
            SELECT id FROM public.test_suites
            WHERE project_id IN (
                SELECT id FROM public.projects WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "test_cases_delete_policy"
    ON public.test_cases
    FOR DELETE
    USING (
        suite_id IN (
            SELECT id FROM public.test_suites
            WHERE project_id IN (
                SELECT id FROM public.projects WHERE user_id = auth.uid()
            )
        )
    );
