-- F5: project overview. Two read-only functions the API calls with the service role; they add no
-- tables and change no data. Additive only.
--   project_overview(project, tz): pass rate over 30 days, runs per day for 14 days (days in the
--     viewer's timezone), and the last result of each test case with an "unstable" flag.
--   projects_health(user): the 30-day counts and last run of each of a user's projects (project cards).
-- A run counts toward the pass rate only when it ended with a verdict (passed or failed); stopped
-- and interrupted runs are "error" and are shown separately.

CREATE OR REPLACE FUNCTION public.project_overview(p_project_id UUID, p_tz TEXT DEFAULT 'UTC')
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH recent AS (
    SELECT status, (created_at AT TIME ZONE p_tz)::date AS day, created_at
    FROM public.test_runs
    WHERE project_id = p_project_id AND created_at >= now() - interval '30 days'
),
days AS (
    SELECT d::date AS day
    FROM generate_series((now() AT TIME ZONE p_tz)::date - 13, (now() AT TIME ZONE p_tz)::date, interval '1 day') AS d
),
per_day AS (
    SELECT days.day,
           count(*) FILTER (WHERE recent.status = 'passed') AS passed,
           count(*) FILTER (WHERE recent.status = 'failed') AS failed,
           count(*) FILTER (WHERE recent.status IN ('error', 'skipped')) AS other
    FROM days LEFT JOIN recent ON recent.day = days.day
    GROUP BY days.day
),
-- ponytail: ranks every finished run of the project; add an index on (test_case_id, created_at)
-- and a row limit per case if a project grows past tens of thousands of runs.
ranked AS (
    SELECT id, test_case_id, status, created_at,
           row_number() OVER (PARTITION BY test_case_id ORDER BY created_at DESC, id DESC) AS rn
    FROM public.test_runs
    WHERE project_id = p_project_id AND test_case_id IS NOT NULL AND status IN ('passed', 'failed', 'error')
),
per_case AS (
    SELECT test_case_id,
           (array_agg(id ORDER BY rn))[1]         AS run_id,
           (array_agg(status ORDER BY rn))[1]     AS status,
           (array_agg(created_at ORDER BY rn))[1] AS run_at,
           count(DISTINCT status) FILTER (WHERE status IN ('passed', 'failed')) = 2 AS unstable
    FROM ranked
    WHERE rn <= 5
    GROUP BY test_case_id
)
SELECT jsonb_build_object(
    'passed_30d', (SELECT count(*) FROM recent WHERE status = 'passed'),
    'failed_30d', (SELECT count(*) FROM recent WHERE status = 'failed'),
    'runs_30d',   (SELECT count(*) FROM recent),
    'days', (SELECT jsonb_agg(jsonb_build_object('day', day, 'passed', passed, 'failed', failed, 'other', other) ORDER BY day)
             FROM per_day),
    'cases', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'test_case_id', c.id, 'title', c.title, 'suite_id', s.id, 'suite_name', s.name,
                   'status', pc.status, 'run_id', pc.run_id, 'run_at', pc.run_at, 'unstable', pc.unstable)
               ORDER BY pc.run_at DESC)
        FROM per_case pc
        JOIN public.test_cases c ON c.id = pc.test_case_id
        JOIN public.test_suites s ON s.id = c.suite_id
    ), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.projects_health(p_user_id UUID)
RETURNS TABLE (project_id UUID, passed_30d BIGINT, failed_30d BIGINT, last_status TEXT, last_run_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
SELECT p.id, c.passed, c.failed, l.status, l.created_at
FROM public.projects p
LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE r.status = 'passed') AS passed,
           count(*) FILTER (WHERE r.status = 'failed') AS failed
    FROM public.test_runs r
    WHERE r.project_id = p.id AND r.created_at >= now() - interval '30 days'
) c ON true
LEFT JOIN LATERAL (
    SELECT r.status, r.created_at
    FROM public.test_runs r
    WHERE r.project_id = p.id
    ORDER BY r.created_at DESC
    LIMIT 1
) l ON true
WHERE p.user_id = p_user_id;
$$;

-- Only the API (service role) calls these; it checks ownership first. Browser roles get no access.
REVOKE EXECUTE ON FUNCTION public.project_overview(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.projects_health(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_overview(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.projects_health(UUID) TO service_role;
