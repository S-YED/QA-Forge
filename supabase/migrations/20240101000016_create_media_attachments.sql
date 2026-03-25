-- Migration: Create media_attachments table
-- Description: Polymorphic table for storing media files (screenshots, videos,
--              logs, traces, HAR files) attached to any entity. entity_type
--              discriminates which table entity_id refers to — no FK constraint
--              can be added to a polymorphic reference column.
-- NOTE: This table intentionally has NO updated_at column per spec.

CREATE TABLE IF NOT EXISTS public.media_attachments (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type  TEXT        NOT NULL CHECK (entity_type IN (
                                 'test_run', 'test_step', 'bug', 'recorded_session'
                             )),
    entity_id    UUID        NOT NULL,
    type         TEXT        NOT NULL CHECK (type IN (
                                 'screenshot', 'video', 'log', 'trace', 'har'
                             )),
    file_url     TEXT        NOT NULL,
    file_name    TEXT,
    file_size    INTEGER,
    mime_type    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_media_attachments_entity
    ON public.media_attachments(entity_type, entity_id);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.media_attachments ENABLE ROW LEVEL SECURITY;

-- Polymorphic RLS: ownership check depends on entity_type.
-- Each branch joins back to the owning table to verify auth.uid() access.
CREATE POLICY "media_attachments_select_policy"
    ON public.media_attachments
    FOR SELECT
    USING (
        (entity_type = 'test_run'
            AND entity_id IN (
                SELECT id FROM public.test_runs WHERE user_id = auth.uid()
            ))
        OR
        (entity_type = 'test_step'
            AND entity_id IN (
                SELECT ts.id FROM public.test_steps ts
                JOIN public.test_runs tr ON ts.test_run_id = tr.id
                WHERE tr.user_id = auth.uid()
            ))
        OR
        (entity_type = 'bug'
            AND entity_id IN (
                SELECT b.id FROM public.bugs b
                JOIN public.projects p ON b.project_id = p.id
                WHERE p.user_id = auth.uid()
            ))
        OR
        (entity_type = 'recorded_session'
            AND entity_id IN (
                SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid()
            ))
    );

CREATE POLICY "media_attachments_insert_policy"
    ON public.media_attachments
    FOR INSERT
    WITH CHECK (
        (entity_type = 'test_run'
            AND entity_id IN (
                SELECT id FROM public.test_runs WHERE user_id = auth.uid()
            ))
        OR
        (entity_type = 'test_step'
            AND entity_id IN (
                SELECT ts.id FROM public.test_steps ts
                JOIN public.test_runs tr ON ts.test_run_id = tr.id
                WHERE tr.user_id = auth.uid()
            ))
        OR
        (entity_type = 'bug'
            AND entity_id IN (
                SELECT b.id FROM public.bugs b
                JOIN public.projects p ON b.project_id = p.id
                WHERE p.user_id = auth.uid()
            ))
        OR
        (entity_type = 'recorded_session'
            AND entity_id IN (
                SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid()
            ))
    );

CREATE POLICY "media_attachments_update_policy"
    ON public.media_attachments
    FOR UPDATE
    USING (
        (entity_type = 'test_run'
            AND entity_id IN (
                SELECT id FROM public.test_runs WHERE user_id = auth.uid()
            ))
        OR
        (entity_type = 'test_step'
            AND entity_id IN (
                SELECT ts.id FROM public.test_steps ts
                JOIN public.test_runs tr ON ts.test_run_id = tr.id
                WHERE tr.user_id = auth.uid()
            ))
        OR
        (entity_type = 'bug'
            AND entity_id IN (
                SELECT b.id FROM public.bugs b
                JOIN public.projects p ON b.project_id = p.id
                WHERE p.user_id = auth.uid()
            ))
        OR
        (entity_type = 'recorded_session'
            AND entity_id IN (
                SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid()
            ))
    )
    WITH CHECK (
        (entity_type = 'test_run'
            AND entity_id IN (
                SELECT id FROM public.test_runs WHERE user_id = auth.uid()
            ))
        OR
        (entity_type = 'test_step'
            AND entity_id IN (
                SELECT ts.id FROM public.test_steps ts
                JOIN public.test_runs tr ON ts.test_run_id = tr.id
                WHERE tr.user_id = auth.uid()
            ))
        OR
        (entity_type = 'bug'
            AND entity_id IN (
                SELECT b.id FROM public.bugs b
                JOIN public.projects p ON b.project_id = p.id
                WHERE p.user_id = auth.uid()
            ))
        OR
        (entity_type = 'recorded_session'
            AND entity_id IN (
                SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid()
            ))
    );

CREATE POLICY "media_attachments_delete_policy"
    ON public.media_attachments
    FOR DELETE
    USING (
        (entity_type = 'test_run'
            AND entity_id IN (
                SELECT id FROM public.test_runs WHERE user_id = auth.uid()
            ))
        OR
        (entity_type = 'test_step'
            AND entity_id IN (
                SELECT ts.id FROM public.test_steps ts
                JOIN public.test_runs tr ON ts.test_run_id = tr.id
                WHERE tr.user_id = auth.uid()
            ))
        OR
        (entity_type = 'bug'
            AND entity_id IN (
                SELECT b.id FROM public.bugs b
                JOIN public.projects p ON b.project_id = p.id
                WHERE p.user_id = auth.uid()
            ))
        OR
        (entity_type = 'recorded_session'
            AND entity_id IN (
                SELECT id FROM public.recorded_sessions WHERE user_id = auth.uid()
            ))
    );
