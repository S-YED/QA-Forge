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

BEGIN;

-- ─── Fixed UUIDs for reproducibility ─────────────────────────────────────────

-- Users
\set USER_1_ID  '00000000-0000-0000-0000-000000000001'
\set USER_2_ID  '00000000-0000-0000-0000-000000000002'

-- Projects
\set PROJECT_1_ID '10000000-0000-0000-0000-000000000001'
\set PROJECT_2_ID '10000000-0000-0000-0000-000000000002'

-- Test Suites
\set SUITE_1_ID '20000000-0000-0000-0000-000000000001'
\set SUITE_2_ID '20000000-0000-0000-0000-000000000002'

-- Test Cases
\set CASE_1_ID '30000000-0000-0000-0000-000000000001'
\set CASE_2_ID '30000000-0000-0000-0000-000000000002'
\set CASE_3_ID '30000000-0000-0000-0000-000000000003'

-- Test Runs
\set RUN_1_ID '40000000-0000-0000-0000-000000000001'
\set RUN_2_ID '40000000-0000-0000-0000-000000000002'

-- Recorded Session
\set SESSION_1_ID '50000000-0000-0000-0000-000000000001'

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
    :'USER_1_ID',
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
    :'USER_2_ID',
    '00000000-0000-0000-0000-000000000000',
    'bob@qaforge.dev',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"full_name": "Bob Developer", "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=bob"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Promote Alice to admin ────────────────────────────────────────────────
-- The trigger inserts with default role='tester'; upgrade Alice to admin here.

UPDATE public.profiles
SET role = 'admin'
WHERE id = :'USER_1_ID';

-- ─── 3. Projects ─────────────────────────────────────────────────────────────

INSERT INTO public.projects (id, user_id, name, description, base_url) VALUES
(
    :'PROJECT_1_ID',
    :'USER_1_ID',
    'E-Commerce Platform',
    'End-to-end test suite for the main shopping platform including checkout, search, and auth flows.',
    'https://shop.example.com'
),
(
    :'PROJECT_2_ID',
    :'USER_1_ID',
    'Admin Dashboard',
    'Tests for the internal admin panel covering user management and analytics.',
    'https://admin.example.com'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Test Suites ──────────────────────────────────────────────────────────

INSERT INTO public.test_suites (id, project_id, parent_suite_id, name, description) VALUES
(
    :'SUITE_1_ID',
    :'PROJECT_1_ID',
    NULL,
    'Authentication',
    'Login, registration, password reset, and session management tests.'
),
(
    :'SUITE_2_ID',
    :'PROJECT_1_ID',
    :'SUITE_1_ID',
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
    :'CASE_1_ID',
    :'SUITE_2_ID',
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
    :'CASE_2_ID',
    :'SUITE_2_ID',
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
    :'CASE_3_ID',
    :'SUITE_1_ID',
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
    :'RUN_1_ID',
    :'CASE_1_ID',
    :'PROJECT_1_ID',
    :'USER_1_ID',
    'passed',
    'ai_driven',
    'chromium',
    'local',
    4230,
    now() - INTERVAL '2 hours',
    now() - INTERVAL '2 hours' + INTERVAL '4230 milliseconds'
),
(
    :'RUN_2_ID',
    :'CASE_2_ID',
    :'PROJECT_1_ID',
    :'USER_1_ID',
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
('40000000-0000-0000-0000-000000000001', 1, 'navigate',  NULL,              '/login',               'passed', 312),
('40000000-0000-0000-0000-000000000001', 2, 'fill',      '#email',          'user@example.com',     'passed', 45),
('40000000-0000-0000-0000-000000000001', 3, 'fill',      '#password',       'Password123!',         'passed', 38),
('40000000-0000-0000-0000-000000000001', 4, 'click',     'button[type=submit]', NULL,               'passed', 2870),
('40000000-0000-0000-0000-000000000001', 5, 'assert',    '.dashboard-header', 'visible',            'passed', 965);

-- ─── 8. Recorded Session ──────────────────────────────────────────────────────

INSERT INTO public.recorded_sessions (
    id, project_id, user_id, name, description,
    base_url, browser, status, duration_ms, completed_at
) VALUES
(
    :'SESSION_1_ID',
    :'PROJECT_1_ID',
    :'USER_1_ID',
    'Checkout Flow Recording',
    'Manual recording of the add-to-cart → checkout → payment confirmation flow.',
    'https://shop.example.com',
    'chromium',
    'completed',
    18450,
    now() - INTERVAL '30 minutes'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
