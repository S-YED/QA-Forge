-- =============================================================================
-- Migration 24: private test artifacts (EXE-3)
-- =============================================================================
-- Screenshots of the application under test can show private data, so the
-- `test-artifacts` bucket stops being public. The API (service role) stores the
-- object path and returns a short-lived signed URL whenever an owner reads a run
-- or a bug (apps/api/src/utils/artifacts.ts). Anonymous reads are refused.
--
-- Existing rows held public URLs; they become bucket paths. Seeded demo images
-- (`/demo/...`) and external URLs are left as they are. Idempotent.
-- =============================================================================

UPDATE storage.buckets SET public = false WHERE id = 'test-artifacts';

DROP POLICY IF EXISTS "Public read for test artifacts" ON storage.objects;

UPDATE public.test_steps
SET screenshot_url = regexp_replace(screenshot_url, '^https?://[^/]+/storage/v1/object/public/test-artifacts/', '')
WHERE screenshot_url ~ '^https?://[^/]+/storage/v1/object/public/test-artifacts/';

UPDATE public.bugs b
SET screenshot_urls = ARRAY(
  SELECT regexp_replace(u, '^https?://[^/]+/storage/v1/object/public/test-artifacts/', '')
  FROM unnest(b.screenshot_urls) WITH ORDINALITY AS t(u, ord)
  ORDER BY ord
)
WHERE EXISTS (
  SELECT 1 FROM unnest(b.screenshot_urls) AS u
  WHERE u ~ '^https?://[^/]+/storage/v1/object/public/test-artifacts/'
);
