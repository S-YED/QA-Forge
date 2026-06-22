-- Migration: Performance indices
-- Description: Adds optimal indices on key foreign key columns frequently used in WHERE filters and JOINs.

-- 1. Test Cases
CREATE INDEX IF NOT EXISTS idx_test_cases_suite_id
    ON public.test_cases(suite_id);

-- 2. Test Runs
CREATE INDEX IF NOT EXISTS idx_test_runs_project_id
    ON public.test_runs(project_id);

CREATE INDEX IF NOT EXISTS idx_test_runs_test_case_id
    ON public.test_runs(test_case_id);

-- 3. Test Steps
CREATE INDEX IF NOT EXISTS idx_test_steps_test_run_id
    ON public.test_steps(test_run_id);

-- 4. Bugs
CREATE INDEX IF NOT EXISTS idx_bugs_project_id
    ON public.bugs(project_id);

CREATE INDEX IF NOT EXISTS idx_bugs_test_run_id
    ON public.bugs(test_run_id);
