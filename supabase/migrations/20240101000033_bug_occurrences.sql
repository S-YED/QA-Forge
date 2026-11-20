-- Migration 33 (G13): a case that keeps failing adds to its open bug instead of filing a new one on every run.
-- A nightly schedule used to open a bug a night. The bug now counts its failures and points at the latest failing run
-- (bugs.test_run_id moves forward). Additive only; until it exists the API files a new bug each time, as before.

ALTER TABLE public.bugs
    ADD COLUMN IF NOT EXISTS occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences >= 1);
