-- =============================================================================
-- QAForge Local Development Seed Data
-- =============================================================================
-- PURPOSE: Provides reproducible demo data for local Supabase development.
--          DO NOT run this in production.
--
-- USAGE:   Applied automatically by `supabase db reset`
--          or manually via: psql <connection_string> -f supabase/seed.sql
--
-- NOTE:    The handle_new_user() trigger automatically creates a profile row
--          when a user is inserted into auth.users. We insert directly into
--          auth.users with fixed UUIDs for fully reproducible dev data.
-- =============================================================================

DO $$
DECLARE
    -- ─── Fixed UUIDs for reproducibility ─────────────────────────────────────
    -- Users
    v_user_1    UUID := '00000000-0000-0000-0000-000000000001';
    v_user_2    UUID := '00000000-0000-0000-0000-000000000002';
    v_user_3    UUID := '00000000-0000-0000-0000-000000000003';
    -- Projects
    v_project_1 UUID := '10000000-0000-0000-0000-000000000001';
    v_project_2 UUID := '10000000-0000-0000-0000-000000000002';
    -- Test Suites
    v_suite_1   UUID := '20000000-0000-0000-0000-000000000001';
    v_suite_2   UUID := '20000000-0000-0000-0000-000000000002';
    -- Test Cases
    v_case_1    UUID := '30000000-0000-0000-0000-000000000001';
    v_case_2    UUID := '30000000-0000-0000-0000-000000000002';
    v_case_3    UUID := '30000000-0000-0000-0000-000000000003';
    -- Test Runs
    v_run_1     UUID := '40000000-0000-0000-0000-000000000001';
    v_run_2     UUID := '40000000-0000-0000-0000-000000000002';
    -- Recorded Session
    v_session_1 UUID := '50000000-0000-0000-0000-000000000001';
BEGIN

-- ─── 1. Auth Users ────────────────────────────────────────────────────────────
-- The on_auth_user_created trigger will fire for each INSERT and auto-populate profiles.

INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud
) VALUES
(
    v_user_1,
    '00000000-0000-0000-0000-000000000000',
    'alice@qaforge.dev',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"full_name": "Alice Tester", "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=alice"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
),
(
    v_user_2,
    '00000000-0000-0000-0000-000000000000',
    'bob@qaforge.dev',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"full_name": "Bob Developer", "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=bob"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
),
(
    v_user_3,
    '00000000-0000-0000-0000-000000000000',
    'sy3dkm@gmail.com',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"full_name": "Syed K", "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=syed"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Promote Alice and Syed to admin ───────────────────────────────────────
-- The trigger inserts with default role='tester'; upgrade them to admin here.

UPDATE public.profiles
SET role = 'admin'
WHERE id IN (v_user_1, v_user_3);

-- ─── 3. Projects ─────────────────────────────────────────────────────────────

INSERT INTO public.projects (id, user_id, name, description, base_url) VALUES
(
    v_project_1,
    v_user_1,
    'E-Commerce Platform',
    'End-to-end test suite for the main shopping platform including checkout, search, and auth flows.',
    'https://shop.example.com'
),
(
    v_project_2,
    v_user_1,
    'Admin Dashboard',
    'Tests for the internal admin panel covering user management and analytics.',
    'https://admin.example.com'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Test Suites ──────────────────────────────────────────────────────────

INSERT INTO public.test_suites (id, project_id, parent_suite_id, name, description) VALUES
(
    v_suite_1,
    v_project_1,
    NULL,
    'Authentication',
    'Login, registration, password reset, and session management tests.'
),
(
    v_suite_2,
    v_project_1,
    v_suite_1,
    'Login Flows',
    'Specific login scenarios: valid credentials, invalid password, locked accounts.'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. Test Cases ───────────────────────────────────────────────────────────

INSERT INTO public.test_cases (
    id, suite_id, title, description, steps, expected_result,
    priority, type, tags, is_ai_generated, source
) VALUES
(
    v_case_1,
    v_suite_2,
    'Successful login with valid credentials',
    'Verifies that a registered user can log in with correct email and password.',
    '[
        {"step": 1, "action": "navigate", "value": "/login"},
        {"step": 2, "action": "fill", "selector": "#email", "value": "user@example.com"},
        {"step": 3, "action": "fill", "selector": "#password", "value": "Password123!"},
        {"step": 4, "action": "click", "selector": "button[type=submit]"},
        {"step": 5, "action": "assert", "selector": ".dashboard-header", "value": "visible"}
    ]'::jsonb,
    'User is redirected to the dashboard with a welcome message.',
    'critical',
    'functional',
    ARRAY['auth', 'login', 'smoke'],
    false,
    'manual'
),
(
    v_case_2,
    v_suite_2,
    'Login fails with incorrect password',
    'Verifies that an error message is shown when wrong password is entered.',
    '[
        {"step": 1, "action": "navigate", "value": "/login"},
        {"step": 2, "action": "fill", "selector": "#email", "value": "user@example.com"},
        {"step": 3, "action": "fill", "selector": "#password", "value": "WrongPassword"},
        {"step": 4, "action": "click", "selector": "button[type=submit]"},
        {"step": 5, "action": "assert", "selector": ".error-message", "value": "visible"}
    ]'::jsonb,
    'An error message "Invalid credentials" is displayed.',
    'high',
    'negative',
    ARRAY['auth', 'login', 'negative'],
    false,
    'manual'
),
(
    v_case_3,
    v_suite_1,
    'Password reset email is sent',
    'Verifies that clicking "Forgot Password" triggers a reset email.',
    '[
        {"step": 1, "action": "navigate", "value": "/forgot-password"},
        {"step": 2, "action": "fill", "selector": "#email", "value": "user@example.com"},
        {"step": 3, "action": "click", "selector": "button[type=submit]"},
        {"step": 4, "action": "assert", "selector": ".success-banner", "value": "visible"}
    ]'::jsonb,
    'A success banner confirms the reset email was sent.',
    'medium',
    'functional',
    ARRAY['auth', 'password-reset'],
    true,
    'ai_generated'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 6. Test Runs ─────────────────────────────────────────────────────────────

INSERT INTO public.test_runs (
    id, test_case_id, project_id, user_id, status, mode,
    browser, environment, duration_ms, started_at, completed_at
) VALUES
(
    v_run_1,
    v_case_1,
    v_project_1,
    v_user_1,
    'passed',
    'ai_driven',
    'chromium',
    'local',
    4230,
    now() - INTERVAL '2 hours',
    now() - INTERVAL '2 hours' + INTERVAL '4230 milliseconds'
),
(
    v_run_2,
    v_case_2,
    v_project_1,
    v_user_1,
    'failed',
    'ai_driven',
    'firefox',
    'staging',
    1850,
    now() - INTERVAL '1 hour',
    now() - INTERVAL '1 hour' + INTERVAL '1850 milliseconds'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 7. Test Steps (for the passed run) ──────────────────────────────────────

INSERT INTO public.test_steps (
    test_run_id, step_number, action, selector, value, status, duration_ms
) VALUES
(v_run_1, 1, 'navigate',  NULL,                '/login',               'passed', 312),
(v_run_1, 2, 'fill',      '#email',            'user@example.com',     'passed', 45),
(v_run_1, 3, 'fill',      '#password',         'Password123!',         'passed', 38),
(v_run_1, 4, 'click',     'button[type=submit]', NULL,                 'passed', 2870),
(v_run_1, 5, 'assert',    '.dashboard-header', 'visible',              'passed', 965);

-- ─── 8. Recorded Session ──────────────────────────────────────────────────────

INSERT INTO public.recorded_sessions (
    id, project_id, user_id, name, description,
    base_url, browser, status, duration_ms, completed_at
) VALUES
(
    v_session_1,
    v_project_1,
    v_user_1,
    'Checkout Flow Recording',
    'Manual recording of the add-to-cart → checkout → payment confirmation flow.',
    'https://shop.example.com',
    'chromium',
    'completed',
    18450,
    now() - INTERVAL '30 minutes'
)
ON CONFLICT (id) DO NOTHING;

END $$;
