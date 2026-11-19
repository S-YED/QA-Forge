-- Migration 32 (CR-12): a recording's test case points at its recording.
-- Replay used to find "its" case by a description that Duplicate copies word for word, so a replay could overwrite a
-- copied and edited case, or lose the original once its description was edited. Additive only.

ALTER TABLE public.test_cases
    ADD COLUMN IF NOT EXISTS recorded_session_id UUID REFERENCES public.recorded_sessions(id) ON DELETE SET NULL;

-- One case per recording; most cases have none.
CREATE UNIQUE INDEX IF NOT EXISTS test_cases_recorded_session_id_key
    ON public.test_cases(recorded_session_id)
    WHERE recorded_session_id IS NOT NULL;

-- Link the cases replays made before this migration: the oldest case carrying the recording's marker (copies are newer).
UPDATE public.test_cases tc
SET recorded_session_id = pick.session_id
FROM (
    SELECT DISTINCT ON (rs.id) rs.id AS session_id, c.id AS case_id
    FROM public.recorded_sessions rs
    JOIN public.test_cases c ON c.description = 'Automated compile of recorded session ' || rs.id::text
    ORDER BY rs.id, c.created_at ASC
) pick
WHERE tc.id = pick.case_id
  AND tc.recorded_session_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.test_cases o WHERE o.recorded_session_id = pick.session_id);
