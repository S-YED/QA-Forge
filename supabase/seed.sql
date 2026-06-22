-- =============================================================================
-- QAForge Local Development Seed Data  (LOCAL ONLY)
-- =============================================================================
-- PURPOSE: Reproducible demo data for LOCAL Supabase development. This file
--          creates extra developer accounts (alice/bob/carol) with the shared
--          dev password 'Password123!' and promotes some to admin — which is
--          fine locally but MUST NEVER touch production.
--
-- ⛔ PRODUCTION: Do NOT run this file, and NEVER run `supabase db reset --linked`
--    (it DROPS the linked database). For production use `supabase/seed-prod.sql`,
--    which creates ONLY the read-only demo account and no public credentials.
--    See artifacts/01-Production-Deployment-Guide.md.
--
-- USAGE:   Applied automatically by `supabase db reset` (local only)
--          or manually via: psql <local_connection_string> -f supabase/seed.sql
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
    v_demo_user UUID := '00000000-0000-0000-0000-000000000099';
    -- Projects (demo-owned)
    v_project_1 UUID := '10000000-0000-0000-0000-000000000001';
    v_project_2 UUID := '10000000-0000-0000-0000-000000000002';
    v_project_3 UUID := '10000000-0000-0000-0000-000000000003';
    -- Test Suites
    v_suite_1   UUID := '20000000-0000-0000-0000-000000000001';
    v_suite_2   UUID := '20000000-0000-0000-0000-000000000002';
    v_suite_3   UUID := '20000000-0000-0000-0000-000000000003';
    v_suite_4   UUID := '20000000-0000-0000-0000-000000000004';
    v_suite_5   UUID := '20000000-0000-0000-0000-000000000005';
    -- Test Cases
    v_case_1    UUID := '30000000-0000-0000-0000-000000000001';
    v_case_2    UUID := '30000000-0000-0000-0000-000000000002';
    v_case_3    UUID := '30000000-0000-0000-0000-000000000003';
    v_case_4    UUID := '30000000-0000-0000-0000-000000000004';
    v_case_5    UUID := '30000000-0000-0000-0000-000000000005';
    v_case_6    UUID := '30000000-0000-0000-0000-000000000006';
    v_case_7    UUID := '30000000-0000-0000-0000-000000000007';
    v_case_8    UUID := '30000000-0000-0000-0000-000000000008';
    -- Test Runs
    v_run_1     UUID := '40000000-0000-0000-0000-000000000001';
    v_run_2     UUID := '40000000-0000-0000-0000-000000000002';
    v_run_3     UUID := '40000000-0000-0000-0000-000000000003';
    v_run_4     UUID := '40000000-0000-0000-0000-000000000004';
    v_run_5     UUID := '40000000-0000-0000-0000-000000000005';
    v_run_6     UUID := '40000000-0000-0000-0000-000000000006';
    v_run_7     UUID := '40000000-0000-0000-0000-000000000007';
    v_run_8     UUID := '40000000-0000-0000-0000-000000000008';
    v_run_9     UUID := '40000000-0000-0000-0000-000000000009';
    v_run_10    UUID := '40000000-0000-0000-0000-000000000010';
    -- Recorded Session
    v_session_1 UUID := '50000000-0000-0000-0000-000000000001';
    -- Bugs
    v_bug_1     UUID := '60000000-0000-0000-0000-000000000001';
    v_bug_2     UUID := '60000000-0000-0000-0000-000000000002';
    v_bug_3     UUID := '60000000-0000-0000-0000-000000000003';
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
    'carol@qaforge.dev',
    crypt('Password123!', gen_salt('bf')),
    now(),
    '{"full_name": "Carol QA", "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=carol"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
),
(
    v_demo_user,
    '00000000-0000-0000-0000-000000000000',
    'demo@qaforge.dev',
    crypt('DemoPassword123!', gen_salt('bf')),
    now(),
    '{"full_name": "Demo User", "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=demo"}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- GoTrue compatibility: directly-inserted users leave token columns NULL, and
-- GoTrue ≥ v2.1xx fails to scan NULL into Go strings ("Database error querying
-- schema") on sign-in. Backfill them to empty strings.
UPDATE auth.users SET
    confirmation_token         = COALESCE(confirmation_token, ''),
    recovery_token             = COALESCE(recovery_token, ''),
    email_change               = COALESCE(email_change, ''),
    email_change_token_new     = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    phone_change               = COALESCE(phone_change, ''),
    phone_change_token         = COALESCE(phone_change_token, ''),
    reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE email LIKE '%@qaforge.dev';

-- ─── 2. Promote Alice and Syed to admin, mark demo user ────────────────────
-- The trigger inserts with default role='tester'; upgrade them to admin here.

UPDATE public.profiles
SET role = 'admin'
WHERE id IN (v_user_1, v_user_3);

UPDATE public.profiles
SET is_demo = true
WHERE id = v_demo_user;

-- ─── 3. Projects (owned by demo user) ──────────────────────────────────────

INSERT INTO public.projects (id, user_id, name, description, base_url) VALUES
(
    v_project_1,
    v_demo_user,
    'E-Commerce Platform',
    'End-to-end test suite for the main shopping platform including checkout, search, and auth flows.',
    'https://shop.example.com'
),
(
    v_project_2,
    v_demo_user,
    'Admin Dashboard',
    'Tests for the internal admin panel covering user management, analytics, and role-based access control.',
    'https://admin.example.com'
),
(
    v_project_3,
    v_demo_user,
    'User Dashboard',
    'QA suite for the customer-facing dashboard: profile management, notification settings, billing, and data export.',
    'https://dashboard.example.com'
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
),
(
    v_suite_3,
    v_project_1,
    NULL,
    'Checkout & Payment',
    'Cart operations, checkout form validation, payment processing, and order confirmation.'
),
(
    v_suite_4,
    v_project_2,
    NULL,
    'User Management',
    'CRUD operations for user accounts, role assignments, and bulk actions.'
),
(
    v_suite_5,
    v_project_3,
    NULL,
    'Profile & Settings',
    'Profile editing, avatar upload, notification preferences, and data export.'
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
        {"step_number": 1, "instruction": "navigate", "value": "/login"},
        {"step_number": 2, "instruction": "fill", "selector": "#email", "value": "user@example.com"},
        {"step_number": 3, "instruction": "fill", "selector": "#password", "value": "Password123!"},
        {"step_number": 4, "instruction": "click", "selector": "button[type=submit]"},
        {"step_number": 5, "instruction": "assert", "selector": ".dashboard-header", "value": "visible"}
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
        {"step_number": 1, "instruction": "navigate", "value": "/login"},
        {"step_number": 2, "instruction": "fill", "selector": "#email", "value": "user@example.com"},
        {"step_number": 3, "instruction": "fill", "selector": "#password", "value": "WrongPassword"},
        {"step_number": 4, "instruction": "click", "selector": "button[type=submit]"},
        {"step_number": 5, "instruction": "assert", "selector": ".error-message", "value": "visible"}
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
        {"step_number": 1, "instruction": "navigate", "value": "/forgot-password"},
        {"step_number": 2, "instruction": "fill", "selector": "#email", "value": "user@example.com"},
        {"step_number": 3, "instruction": "click", "selector": "button[type=submit]"},
        {"step_number": 4, "instruction": "assert", "selector": ".success-banner", "value": "visible"}
    ]'::jsonb,
    'A success banner confirms the reset email was sent.',
    'medium',
    'functional',
    ARRAY['auth', 'password-reset'],
    true,
    'ai_generated'
),
(
    v_case_4,
    v_suite_3,
    'Add item to cart and verify total',
    'Adds a product to the shopping cart and verifies the cart total updates correctly.',
    '[
        {"step_number": 1, "instruction": "navigate", "value": "/products/wireless-headphones"},
        {"step_number": 2, "instruction": "click", "selector": "button.add-to-cart"},
        {"step_number": 3, "instruction": "assert", "selector": ".cart-badge", "value": "1"},
        {"step_number": 4, "instruction": "navigate", "value": "/cart"},
        {"step_number": 5, "instruction": "assert", "selector": ".cart-total", "value": "$79.99"}
    ]'::jsonb,
    'Cart shows 1 item with correct total price.',
    'critical',
    'functional',
    ARRAY['cart', 'checkout', 'smoke'],
    true,
    'ai_generated'
),
(
    v_case_5,
    v_suite_3,
    'Complete checkout with valid payment',
    'Full checkout flow from cart to order confirmation page.',
    '[
        {"step_number": 1, "instruction": "navigate", "value": "/cart"},
        {"step_number": 2, "instruction": "click", "selector": "button.checkout"},
        {"step_number": 3, "instruction": "fill", "selector": "#card-number", "value": "4242424242424242"},
        {"step_number": 4, "instruction": "fill", "selector": "#card-expiry", "value": "12/28"},
        {"step_number": 5, "instruction": "fill", "selector": "#card-cvc", "value": "123"},
        {"step_number": 6, "instruction": "click", "selector": "button.pay-now"},
        {"step_number": 7, "instruction": "assert", "selector": ".order-confirmation", "value": "visible"}
    ]'::jsonb,
    'Order confirmation page displays with order number and summary.',
    'critical',
    'functional',
    ARRAY['checkout', 'payment', 'smoke'],
    true,
    'ai_generated'
),
(
    v_case_6,
    v_suite_4,
    'Admin creates a new user account',
    'Tests the admin ability to create user accounts with role assignment.',
    '[
        {"step_number": 1, "instruction": "navigate", "value": "/admin/users"},
        {"step_number": 2, "instruction": "click", "selector": "button.create-user"},
        {"step_number": 3, "instruction": "fill", "selector": "#new-user-email", "value": "newuser@test.com"},
        {"step_number": 4, "instruction": "fill", "selector": "#new-user-name", "value": "Jane Smith"},
        {"step_number": 5, "instruction": "click", "selector": "#role-select"},
        {"step_number": 6, "instruction": "click", "selector": "[data-value=editor]"},
        {"step_number": 7, "instruction": "click", "selector": "button.submit-user"},
        {"step_number": 8, "instruction": "assert", "selector": ".success-toast", "value": "visible"}
    ]'::jsonb,
    'New user appears in the user list with correct role.',
    'high',
    'functional',
    ARRAY['admin', 'user-management', 'crud'],
    true,
    'ai_generated'
),
(
    v_case_7,
    v_suite_5,
    'Update profile display name',
    'User updates their display name in profile settings.',
    '[
        {"step_number": 1, "instruction": "navigate", "value": "/settings/profile"},
        {"step_number": 2, "instruction": "fill", "selector": "#display-name", "value": "Updated Name"},
        {"step_number": 3, "instruction": "click", "selector": "button.save-profile"},
        {"step_number": 4, "instruction": "assert", "selector": ".success-message", "value": "visible"},
        {"step_number": 5, "instruction": "assert", "selector": "#display-name", "value": "Updated Name"}
    ]'::jsonb,
    'Display name is updated and persists on page reload.',
    'medium',
    'functional',
    ARRAY['profile', 'settings'],
    false,
    'manual'
),
(
    v_case_8,
    v_suite_5,
    'Export user data as CSV',
    'Verifies the data export feature generates and downloads a valid CSV file.',
    '[
        {"step_number": 1, "instruction": "navigate", "value": "/settings/data"},
        {"step_number": 2, "instruction": "click", "selector": "button.export-csv"},
        {"step_number": 3, "instruction": "assert", "selector": ".export-progress", "value": "visible"},
        {"step_number": 4, "instruction": "assert", "selector": ".download-complete", "value": "visible"}
    ]'::jsonb,
    'CSV file downloads successfully with correct data format.',
    'low',
    'functional',
    ARRAY['data-export', 'settings', 'csv'],
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
    v_run_1, v_case_1, v_project_1, v_demo_user,
    'passed', 'ai_driven', 'chromium', 'staging',
    4230, now() - INTERVAL '48 hours', now() - INTERVAL '48 hours' + INTERVAL '4230 milliseconds'
),
(
    v_run_2, v_case_2, v_project_1, v_demo_user,
    'failed', 'ai_driven', 'firefox', 'staging',
    1850, now() - INTERVAL '47 hours', now() - INTERVAL '47 hours' + INTERVAL '1850 milliseconds'
),
(
    v_run_3, v_case_1, v_project_1, v_demo_user,
    'passed', 'ai_driven', 'chromium', 'production',
    3150, now() - INTERVAL '24 hours', now() - INTERVAL '24 hours' + INTERVAL '3150 milliseconds'
),
(
    v_run_4, v_case_4, v_project_1, v_demo_user,
    'passed', 'manual_recording', 'chromium', 'staging',
    5670, now() - INTERVAL '20 hours', now() - INTERVAL '20 hours' + INTERVAL '5670 milliseconds'
),
(
    v_run_5, v_case_5, v_project_1, v_demo_user,
    'failed', 'ai_driven', 'webkit', 'staging',
    8920, now() - INTERVAL '18 hours', now() - INTERVAL '18 hours' + INTERVAL '8920 milliseconds'
),
(
    v_run_6, v_case_3, v_project_1, v_demo_user,
    'passed', 'ai_driven', 'chromium', 'local',
    2450, now() - INTERVAL '12 hours', now() - INTERVAL '12 hours' + INTERVAL '2450 milliseconds'
),
(
    v_run_7, v_case_6, v_project_2, v_demo_user,
    'passed', 'ai_driven', 'chromium', 'staging',
    6780, now() - INTERVAL '8 hours', now() - INTERVAL '8 hours' + INTERVAL '6780 milliseconds'
),
(
    v_run_8, v_case_6, v_project_2, v_demo_user,
    'failed', 'manual_recording', 'firefox', 'staging',
    4120, now() - INTERVAL '6 hours', now() - INTERVAL '6 hours' + INTERVAL '4120 milliseconds'
),
(
    v_run_9, v_case_7, v_project_3, v_demo_user,
    'passed', 'ai_driven', 'chromium', 'local',
    3890, now() - INTERVAL '4 hours', now() - INTERVAL '4 hours' + INTERVAL '3890 milliseconds'
),
(
    v_run_10, v_case_8, v_project_3, v_demo_user,
    'passed', 'manual_recording', 'chromium', 'staging',
    7230, now() - INTERVAL '2 hours', now() - INTERVAL '2 hours' + INTERVAL '7230 milliseconds'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 7. Test Steps (for key runs) ────────────────────────────────────────────

-- Steps for run 1 (passed login)
INSERT INTO public.test_steps (
    test_run_id, step_number, action, selector, value, status, duration_ms
) VALUES
(v_run_1, 1, 'navigate',  NULL,                '/login',               'passed', 312),
(v_run_1, 2, 'fill',      '#email',            'user@example.com',     'passed', 45),
(v_run_1, 3, 'fill',      '#password',         'Password123!',         'passed', 38),
(v_run_1, 4, 'click',     'button[type=submit]', NULL,                 'passed', 2870),
(v_run_1, 5, 'assert',    '.dashboard-header', 'visible',              'passed', 965);

-- Steps for run 2 (failed login — wrong password)
INSERT INTO public.test_steps (
    test_run_id, step_number, action, selector, value, status, duration_ms
) VALUES
(v_run_2, 1, 'navigate',  NULL,                '/login',               'passed', 285),
(v_run_2, 2, 'fill',      '#email',            'user@example.com',     'passed', 42),
(v_run_2, 3, 'fill',      '#password',         'WrongPassword',        'passed', 35),
(v_run_2, 4, 'click',     'button[type=submit]', NULL,                 'passed', 1200),
(v_run_2, 5, 'assert',    '.error-message',    'visible',              'failed', 288);

-- Steps for run 4 (passed cart add)
INSERT INTO public.test_steps (
    test_run_id, step_number, action, selector, value, status, duration_ms
) VALUES
(v_run_4, 1, 'navigate',  NULL,                '/products/wireless-headphones', 'passed', 890),
(v_run_4, 2, 'click',     'button.add-to-cart', NULL,                   'passed', 220),
(v_run_4, 3, 'assert',    '.cart-badge',       '1',                     'passed', 150),
(v_run_4, 4, 'navigate',  NULL,                '/cart',                  'passed', 670),
(v_run_4, 5, 'assert',    '.cart-total',       '$79.99',                'passed', 3740);

-- Steps for run 5 (failed checkout — payment timeout)
INSERT INTO public.test_steps (
    test_run_id, step_number, action, selector, value, status, duration_ms
) VALUES
(v_run_5, 1, 'navigate',  NULL,                '/cart',                 'passed', 420),
(v_run_5, 2, 'click',     'button.checkout',   NULL,                    'passed', 350),
(v_run_5, 3, 'fill',      '#card-number',      '4242424242424242',      'passed', 180),
(v_run_5, 4, 'fill',      '#card-expiry',      '12/28',                 'passed', 90),
(v_run_5, 5, 'fill',      '#card-cvc',         '123',                   'passed', 85),
(v_run_5, 6, 'click',     'button.pay-now',    NULL,                    'failed', 7795),
(v_run_5, 7, 'assert',    '.order-confirmation', 'visible',             'skipped', 0);

-- Steps for run 7 (passed admin user creation)
INSERT INTO public.test_steps (
    test_run_id, step_number, action, selector, value, status, duration_ms
) VALUES
(v_run_7, 1, 'navigate',  NULL,                '/admin/users',          'passed', 520),
(v_run_7, 2, 'click',     'button.create-user', NULL,                   'passed', 180),
(v_run_7, 3, 'fill',      '#new-user-email',   'newuser@test.com',      'passed', 95),
(v_run_7, 4, 'fill',      '#new-user-name',    'Jane Smith',            'passed', 88),
(v_run_7, 5, 'click',     '#role-select',      NULL,                    'passed', 120),
(v_run_7, 6, 'click',     '[data-value=editor]', NULL,                  'passed', 145),
(v_run_7, 7, 'click',     'button.submit-user', NULL,                   'passed', 4870),
(v_run_7, 8, 'assert',    '.success-toast',    'visible',               'passed', 762);

-- ─── 8. Recorded Session ──────────────────────────────────────────────────────

INSERT INTO public.recorded_sessions (
    id, project_id, user_id, name, description,
    base_url, browser, status, duration_ms, completed_at
) VALUES
(
    v_session_1,
    v_project_1,
    v_demo_user,
    'Checkout Flow Recording',
    'Manual recording of the add-to-cart → checkout → payment confirmation flow.',
    'https://shop.example.com',
    'chromium',
    'completed',
    18450,
    now() - INTERVAL '30 minutes'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 9. Bugs (auto-created from failed runs) ────────────────────────────────

INSERT INTO public.bugs (
    id, project_id, test_run_id, title, description,
    severity, status, steps_to_reproduce
) VALUES
(
    v_bug_1,
    v_project_1,
    v_run_2,
    'Login error message not displayed on Firefox',
    'When entering wrong credentials on Firefox, the .error-message element is not rendered. The assertion for visibility fails consistently. This appears to be a CSS rendering issue specific to Firefox where the error toast has display:none.',
    'high',
    'open',
    '[
        {"step": 1, "description": "Navigate to /login using Firefox"},
        {"step": 2, "description": "Enter valid email and wrong password"},
        {"step": 3, "description": "Click submit button"},
        {"step": 4, "description": "Observe: error message element exists in DOM but is not visible"}
    ]'::jsonb
),
(
    v_bug_2,
    v_project_1,
    v_run_5,
    'Payment gateway timeout on WebKit',
    'Checkout payment step times out after ~8 seconds on WebKit browser. The pay-now button click does not complete within the expected timeframe. Likely a WebKit-specific issue with the Stripe.js integration or the payment iframe not loading properly.',
    'critical',
    'open',
    '[
        {"step": 1, "description": "Add item to cart and proceed to checkout"},
        {"step": 2, "description": "Fill in valid payment details (test card 4242...)"},
        {"step": 3, "description": "Click Pay Now button"},
        {"step": 4, "description": "Observe: button click hangs for ~8s then times out"}
    ]'::jsonb
),
(
    v_bug_3,
    v_project_2,
    v_run_8,
    'User creation form resets on tab switch in Firefox',
    'When creating a new user in the admin panel on Firefox, switching browser tabs and returning causes the form to reset. All filled fields are cleared and the role selection reverts to default. This only occurs in Firefox — Chromium retains form state correctly.',
    'medium',
    'in_progress',
    '[
        {"step": 1, "description": "Navigate to /admin/users and click Create User"},
        {"step": 2, "description": "Fill in email, name, and select role"},
        {"step": 3, "description": "Switch to another browser tab, wait 5 seconds"},
        {"step": 4, "description": "Switch back to the admin tab"},
        {"step": 5, "description": "Observe: all form fields are empty"}
    ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ─── 10. Screenshots for the filmstrip ──────────────────────────────────────
-- Give every seeded step a placeholder screenshot so the run-detail filmstrip
-- and scripted live-replay have images to show locally. (Production uses
-- seed-prod.sql, which seeds screenshots + steps for all 10 runs.)
UPDATE public.test_steps
SET screenshot_url = 'https://placehold.co/1280x720/0f0e17/a78bfa/png?text=Step+' || step_number
WHERE test_run_id IN (v_run_1, v_run_2, v_run_4, v_run_5, v_run_7)
  AND status <> 'skipped';

END $$;
