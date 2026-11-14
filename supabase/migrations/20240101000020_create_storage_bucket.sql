-- =============================================================================
-- Migration 20: test-artifacts storage bucket
-- =============================================================================
-- The test orchestration (apps/api/src/websocket/handlers/test.handler.ts)
-- uploads per-step screenshots to the `test-artifacts` bucket and serves them
-- via public URLs in the run-detail filmstrip. Without this bucket every
-- upload fails (gracefully — steps persist without screenshot_url), so the
-- filmstrip stays empty for real runs.
--
-- Uploads happen server-side with the service-role key (bypasses RLS), so the
-- only policy needed here is public READ for serving the screenshot URLs.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('test-artifacts', 'test-artifacts', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so getPublicUrl() links resolve for dashboard users.
DROP POLICY IF EXISTS "Public read for test artifacts" ON storage.objects;
CREATE POLICY "Public read for test artifacts"
ON storage.objects FOR SELECT
USING (bucket_id = 'test-artifacts');
