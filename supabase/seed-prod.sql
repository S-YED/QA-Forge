-- =============================================================================
-- QAForge PRODUCTION Demo Seed  (SAFE to run against Supabase Cloud)
-- =============================================================================
-- PURPOSE: Creates ONLY the read-only demo account + its sample data so the
--          public /demo link works in production. Unlike supabase/seed.sql,
--          this file does NOT create the alice/bob/carol developer accounts and
--          does NOT promote anyone to admin — so no publicly-known credentials
--          ever land in production.
--
-- HOW TO RUN (NEVER use `supabase db reset --linked` — it DROPS the database):
--   1.  supabase db push --linked          # apply the 20 migrations only
--   2.  Open Supabase Studio → SQL Editor → paste this file → Run
--       (or: psql "$DATABASE_URL" -f supabase/seed-prod.sql)
--
-- IDEMPOTENT: every INSERT uses ON CONFLICT DO NOTHING, so re-running is safe.
--
-- The demo password below is intentionally public (it ships in the API for the
-- /api/auth/demo endpoint). That is acceptable ONLY because the demo user is
-- read-only, enforced at two layers:
--   • API layer  → demoGuard blocks all mutating HTTP verbs
--   • DB layer   → migration 19 RESTRICTIVE RLS policies block direct PostgREST
-- If you fork this for a non-read-only account, change the password and keep it
-- out of git.
-- =============================================================================

DO $$
DECLARE
    v_demo_user UUID := '00000000-0000-0000-0000-000000000099';
    -- Projects
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
    -- Screenshot base (clean dark placeholders; swap for real artifact URLs later)
    v_shot      TEXT := 'https://placehold.co/1280x720/0f0e17/a78bfa/png?text=';
BEGIN

-- ─── 1. Demo auth user (read-only) ──────────────────────────────────────────
-- The on_auth_user_created trigger auto-creates the profile row.
INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at, role, aud
) VALUES (
    v_demo_user,
    '00000000-0000-0000-0000-000000000000',
    'demo@qaforge.dev',
    crypt('DemoPassword123!', gen_salt('bf')),
    now(),
    '{"full_name": "Demo User", "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=demo"}'::jsonb,
    now(), now(), 'authenticated', 'authenticated'
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
WHERE id = v_demo_user;

-- Mark as the demo account (read-only). If the profile already exists, ensure flag.
UPDATE public.profiles SET is_demo = true WHERE id = v_demo_user;

-- ─── 2. Projects (owned by demo user) ───────────────────────────────────────
INSERT INTO public.projects (id, user_id, name, description, base_url) VALUES
(v_project_1, v_demo_user, 'E-Commerce Platform',
 'End-to-end test suite for the main shopping platform including checkout, search, and auth flows.',
 'https://shop.example.com'),
(v_project_2, v_demo_user, 'Admin Dashboard',
 'Tests for the internal admin panel covering user management, analytics, and role-based access control.',
 'https://admin.example.com'),
(v_project_3, v_demo_user, 'User Dashboard',
 'QA suite for the customer-facing dashboard: profile management, notification settings, billing, and data export.',
 'https://dashboard.example.com')
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Test Suites ─────────────────────────────────────────────────────────
INSERT INTO public.test_suites (id, project_id, parent_suite_id, name, description) VALUES
(v_suite_1, v_project_1, NULL, 'Authentication', 'Login, registration, password reset, and session management tests.'),
(v_suite_2, v_project_1, v_suite_1, 'Login Flows', 'Specific login scenarios: valid credentials, invalid password, locked accounts.'),
(v_suite_3, v_project_1, NULL, 'Checkout & Payment', 'Cart operations, checkout form validation, payment processing, and order confirmation.'),
(v_suite_4, v_project_2, NULL, 'User Management', 'CRUD operations for user accounts, role assignments, and bulk actions.'),
(v_suite_5, v_project_3, NULL, 'Profile & Settings', 'Profile editing, avatar upload, notification preferences, and data export.')
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Test Cases ──────────────────────────────────────────────────────────
INSERT INTO public.test_cases (
    id, suite_id, title, description, steps, expected_result,
    priority, type, tags, is_ai_generated, source
) VALUES
(v_case_1, v_suite_2, 'Successful login with valid credentials',
 'Verifies that a registered user can log in with correct email and password.',
 '[{"step_number":1,"instruction":"navigate","value":"/login"},{"step_number":2,"instruction":"fill","selector":"#email","value":"user@example.com"},{"step_number":3,"instruction":"fill","selector":"#password","value":"Password123!"},{"step_number":4,"instruction":"click","selector":"button[type=submit]"},{"step_number":5,"instruction":"assert","selector":".dashboard-header"}]'::jsonb,
 'User is redirected to the dashboard with a welcome message.', 'critical', 'functional', ARRAY['auth','login','smoke'], false, 'manual'),
(v_case_2, v_suite_2, 'Login fails with incorrect password',
 'Verifies that an error message is shown when wrong password is entered.',
 '[{"step_number":1,"instruction":"navigate","value":"/login"},{"step_number":2,"instruction":"fill","selector":"#email","value":"user@example.com"},{"step_number":3,"instruction":"fill","selector":"#password","value":"WrongPassword"},{"step_number":4,"instruction":"click","selector":"button[type=submit]"},{"step_number":5,"instruction":"assert","selector":".error-message"}]'::jsonb,
 'An error message "Invalid credentials" is displayed.', 'high', 'negative', ARRAY['auth','login','negative'], false, 'manual'),
(v_case_3, v_suite_1, 'Password reset email is sent',
 'Verifies that clicking "Forgot Password" triggers a reset email.',
 '[{"step_number":1,"instruction":"navigate","value":"/forgot-password"},{"step_number":2,"instruction":"fill","selector":"#email","value":"user@example.com"},{"step_number":3,"instruction":"click","selector":"button[type=submit]"},{"step_number":4,"instruction":"assert","selector":".success-banner"}]'::jsonb,
 'A success banner confirms the reset email was sent.', 'medium', 'functional', ARRAY['auth','password-reset'], true, 'ai_generated'),
(v_case_4, v_suite_3, 'Add item to cart and verify total',
 'Adds a product to the shopping cart and verifies the cart total updates correctly.',
 '[{"step_number":1,"instruction":"navigate","value":"/products/wireless-headphones"},{"step_number":2,"instruction":"click","selector":"button.add-to-cart"},{"step_number":3,"instruction":"assert","selector":".cart-badge","value":"1"},{"step_number":4,"instruction":"navigate","value":"/cart"},{"step_number":5,"instruction":"assert","selector":".cart-total","value":"$79.99"}]'::jsonb,
 'Cart shows 1 item with correct total price.', 'critical', 'functional', ARRAY['cart','checkout','smoke'], true, 'ai_generated'),
(v_case_5, v_suite_3, 'Complete checkout with valid payment',
 'Full checkout flow from cart to order confirmation page.',
 '[{"step_number":1,"instruction":"navigate","value":"/cart"},{"step_number":2,"instruction":"click","selector":"button.checkout"},{"step_number":3,"instruction":"fill","selector":"#card-number","value":"4242424242424242"},{"step_number":4,"instruction":"fill","selector":"#card-expiry","value":"12/28"},{"step_number":5,"instruction":"fill","selector":"#card-cvc","value":"123"},{"step_number":6,"instruction":"click","selector":"button.pay-now"},{"step_number":7,"instruction":"assert","selector":".order-confirmation"}]'::jsonb,
 'Order confirmation page displays with order number and summary.', 'critical', 'functional', ARRAY['checkout','payment','smoke'], true, 'ai_generated'),
(v_case_6, v_suite_4, 'Admin creates a new user account',
 'Tests the admin ability to create user accounts with role assignment.',
 '[{"step_number":1,"instruction":"navigate","value":"/admin/users"},{"step_number":2,"instruction":"click","selector":"button.create-user"},{"step_number":3,"instruction":"fill","selector":"#new-user-email","value":"newuser@test.com"},{"step_number":4,"instruction":"fill","selector":"#new-user-name","value":"Jane Smith"},{"step_number":5,"instruction":"click","selector":"button.submit-user"},{"step_number":6,"instruction":"assert","selector":".success-toast"}]'::jsonb,
 'New user appears in the user list with correct role.', 'high', 'functional', ARRAY['admin','user-management','crud'], true, 'ai_generated'),
(v_case_7, v_suite_5, 'Update profile display name',
 'User updates their display name in profile settings.',
 '[{"step_number":1,"instruction":"navigate","value":"/settings/profile"},{"step_number":2,"instruction":"fill","selector":"#display-name","value":"Updated Name"},{"step_number":3,"instruction":"click","selector":"button.save-profile"},{"step_number":4,"instruction":"assert","selector":".success-message"}]'::jsonb,
 'Display name is updated and persists on page reload.', 'medium', 'functional', ARRAY['profile','settings'], false, 'manual'),
(v_case_8, v_suite_5, 'Export user data as CSV',
 'Verifies the data export feature generates and downloads a valid CSV file.',
 '[{"step_number":1,"instruction":"navigate","value":"/settings/data"},{"step_number":2,"instruction":"click","selector":"button.export-csv"},{"step_number":3,"instruction":"assert","selector":".download-complete"}]'::jsonb,
 'CSV file downloads successfully with correct data format.', 'low', 'functional', ARRAY['data-export','settings','csv'], true, 'ai_generated')
ON CONFLICT (id) DO NOTHING;

-- ─── 5. Test Runs (all terminal — the UI replays them with realistic timing) ─
INSERT INTO public.test_runs (
    id, test_case_id, project_id, user_id, status, mode, browser, environment, duration_ms, started_at, completed_at
) VALUES
(v_run_1,  v_case_1, v_project_1, v_demo_user, 'passed', 'ai_driven', 'chromium', 'staging',    4230, now() - INTERVAL '48 hours', now() - INTERVAL '48 hours' + INTERVAL '4230 milliseconds'),
(v_run_2,  v_case_2, v_project_1, v_demo_user, 'failed', 'ai_driven', 'firefox',  'staging',    1850, now() - INTERVAL '47 hours', now() - INTERVAL '47 hours' + INTERVAL '1850 milliseconds'),
(v_run_3,  v_case_1, v_project_1, v_demo_user, 'passed', 'ai_driven', 'chromium', 'production', 3150, now() - INTERVAL '24 hours', now() - INTERVAL '24 hours' + INTERVAL '3150 milliseconds'),
(v_run_4,  v_case_4, v_project_1, v_demo_user, 'passed', 'manual_recording', 'chromium', 'staging',    5670, now() - INTERVAL '20 hours', now() - INTERVAL '20 hours' + INTERVAL '5670 milliseconds'),
(v_run_5,  v_case_5, v_project_1, v_demo_user, 'failed', 'ai_driven', 'webkit',   'staging',    8920, now() - INTERVAL '18 hours', now() - INTERVAL '18 hours' + INTERVAL '8920 milliseconds'),
(v_run_6,  v_case_3, v_project_1, v_demo_user, 'passed', 'ai_driven', 'chromium', 'local',      2450, now() - INTERVAL '12 hours', now() - INTERVAL '12 hours' + INTERVAL '2450 milliseconds'),
(v_run_7,  v_case_6, v_project_2, v_demo_user, 'passed', 'ai_driven', 'chromium', 'staging',    6780, now() - INTERVAL '8 hours',  now() - INTERVAL '8 hours'  + INTERVAL '6780 milliseconds'),
(v_run_8,  v_case_6, v_project_2, v_demo_user, 'failed', 'manual_recording', 'firefox',  'staging',    4120, now() - INTERVAL '6 hours',  now() - INTERVAL '6 hours'  + INTERVAL '4120 milliseconds'),
(v_run_9,  v_case_7, v_project_3, v_demo_user, 'passed', 'ai_driven', 'chromium', 'local',      3890, now() - INTERVAL '4 hours',  now() - INTERVAL '4 hours'  + INTERVAL '3890 milliseconds'),
(v_run_10, v_case_8, v_project_3, v_demo_user, 'passed', 'manual_recording', 'chromium', 'staging',    7230, now() - INTERVAL '2 hours',  now() - INTERVAL '2 hours'  + INTERVAL '7230 milliseconds')
ON CONFLICT (id) DO NOTHING;

-- ─── 6. Test Steps for ALL 10 runs (with screenshot_url for the filmstrip) ───
INSERT INTO public.test_steps (test_run_id, step_number, action, selector, value, status, duration_ms, screenshot_url) VALUES
-- run 1 (login passed)
(v_run_1, 1, 'navigate', NULL,                  '/login',           'passed', 312,  v_shot || 'Login+Page'),
(v_run_1, 2, 'fill',     '#email',              'user@example.com', 'passed', 45,   v_shot || 'Email+Entered'),
(v_run_1, 3, 'fill',     '#password',           'Password123!',     'passed', 38,   v_shot || 'Password+Entered'),
(v_run_1, 4, 'click',    'button[type=submit]', NULL,               'passed', 2870, v_shot || 'Submitting'),
(v_run_1, 5, 'assert',   '.dashboard-header',   'visible',          'passed', 965,  v_shot || 'Dashboard'),
-- run 2 (login failed)
(v_run_2, 1, 'navigate', NULL,                  '/login',           'passed', 285,  v_shot || 'Login+Page'),
(v_run_2, 2, 'fill',     '#email',              'user@example.com', 'passed', 42,   v_shot || 'Email+Entered'),
(v_run_2, 3, 'fill',     '#password',           'WrongPassword',    'passed', 35,   v_shot || 'Wrong+Password'),
(v_run_2, 4, 'click',    'button[type=submit]', NULL,               'passed', 1200, v_shot || 'Submitting'),
(v_run_2, 5, 'assert',   '.error-message',      'visible',          'failed', 288,  v_shot || 'Assertion+Failed'),
-- run 3 (login passed, production)
(v_run_3, 1, 'navigate', NULL,                  '/login',           'passed', 240,  v_shot || 'Login+Page'),
(v_run_3, 2, 'fill',     '#email',              'user@example.com', 'passed', 40,   v_shot || 'Email+Entered'),
(v_run_3, 3, 'fill',     '#password',           'Password123!',     'passed', 36,   v_shot || 'Password+Entered'),
(v_run_3, 4, 'click',    'button[type=submit]', NULL,               'passed', 1980, v_shot || 'Submitting'),
(v_run_3, 5, 'assert',   '.dashboard-header',   'visible',          'passed', 854,  v_shot || 'Dashboard'),
-- run 4 (cart passed)
(v_run_4, 1, 'navigate', NULL,                  '/products/wireless-headphones', 'passed', 890,  v_shot || 'Product+Page'),
(v_run_4, 2, 'click',    'button.add-to-cart',  NULL,               'passed', 220,  v_shot || 'Added+To+Cart'),
(v_run_4, 3, 'assert',   '.cart-badge',         '1',                'passed', 150,  v_shot || 'Cart+Badge+1'),
(v_run_4, 4, 'navigate', NULL,                  '/cart',            'passed', 670,  v_shot || 'Cart+Page'),
(v_run_4, 5, 'assert',   '.cart-total',         '$79.99',           'passed', 3740, v_shot || 'Cart+Total'),
-- run 5 (checkout failed)
(v_run_5, 1, 'navigate', NULL,                  '/cart',            'passed', 420,  v_shot || 'Cart+Page'),
(v_run_5, 2, 'click',    'button.checkout',     NULL,               'passed', 350,  v_shot || 'Checkout'),
(v_run_5, 3, 'fill',     '#card-number',        '4242424242424242', 'passed', 180,  v_shot || 'Card+Number'),
(v_run_5, 4, 'fill',     '#card-expiry',        '12/28',            'passed', 90,   v_shot || 'Card+Expiry'),
(v_run_5, 5, 'fill',     '#card-cvc',           '123',              'passed', 85,   v_shot || 'Card+CVC'),
(v_run_5, 6, 'click',    'button.pay-now',      NULL,               'failed', 7795, v_shot || 'Payment+Timeout'),
(v_run_5, 7, 'assert',   '.order-confirmation', 'visible',          'skipped', 0,   NULL),
-- run 6 (password reset passed)
(v_run_6, 1, 'navigate', NULL,                  '/forgot-password', 'passed', 360,  v_shot || 'Forgot+Password'),
(v_run_6, 2, 'fill',     '#email',              'user@example.com', 'passed', 44,   v_shot || 'Email+Entered'),
(v_run_6, 3, 'click',    'button[type=submit]', NULL,               'passed', 1480, v_shot || 'Submitting'),
(v_run_6, 4, 'assert',   '.success-banner',     'visible',          'passed', 566,  v_shot || 'Reset+Email+Sent'),
-- run 7 (admin create passed)
(v_run_7, 1, 'navigate', NULL,                  '/admin/users',     'passed', 520,  v_shot || 'Admin+Users'),
(v_run_7, 2, 'click',    'button.create-user',  NULL,               'passed', 180,  v_shot || 'Create+User'),
(v_run_7, 3, 'fill',     '#new-user-email',     'newuser@test.com', 'passed', 95,   v_shot || 'New+Email'),
(v_run_7, 4, 'fill',     '#new-user-name',      'Jane Smith',       'passed', 88,   v_shot || 'New+Name'),
(v_run_7, 5, 'click',    'button.submit-user',  NULL,               'passed', 4870, v_shot || 'Submitting'),
(v_run_7, 6, 'assert',   '.success-toast',      'visible',          'passed', 1027, v_shot || 'User+Created'),
-- run 8 (admin create failed)
(v_run_8, 1, 'navigate', NULL,                  '/admin/users',     'passed', 540,  v_shot || 'Admin+Users'),
(v_run_8, 2, 'click',    'button.create-user',  NULL,               'passed', 175,  v_shot || 'Create+User'),
(v_run_8, 3, 'fill',     '#new-user-email',     'newuser@test.com', 'passed', 92,   v_shot || 'New+Email'),
(v_run_8, 4, 'click',    'button.submit-user',  NULL,               'failed', 3313, v_shot || 'Form+Reset+Bug'),
-- run 9 (profile update passed)
(v_run_9, 1, 'navigate', NULL,                  '/settings/profile','passed', 410,  v_shot || 'Profile+Settings'),
(v_run_9, 2, 'fill',     '#display-name',       'Updated Name',     'passed', 78,   v_shot || 'Name+Entered'),
(v_run_9, 3, 'click',    'button.save-profile', NULL,               'passed', 2980, v_shot || 'Saving'),
(v_run_9, 4, 'assert',   '.success-message',    'visible',          'passed', 422,  v_shot || 'Profile+Saved'),
-- run 10 (csv export passed)
(v_run_10, 1, 'navigate', NULL,                 '/settings/data',   'passed', 480,  v_shot || 'Data+Settings'),
(v_run_10, 2, 'click',    'button.export-csv',  NULL,               'passed', 6240, v_shot || 'Exporting'),
(v_run_10, 3, 'assert',   '.download-complete', 'visible',          'passed', 510,  v_shot || 'Download+Complete')
ON CONFLICT DO NOTHING;

-- ─── 7. Recorded Session ────────────────────────────────────────────────────
INSERT INTO public.recorded_sessions (
    id, project_id, user_id, name, description, base_url, browser, status, duration_ms, completed_at
) VALUES
(v_session_1, v_project_1, v_demo_user, 'Checkout Flow Recording',
 'Manual recording of the add-to-cart → checkout → payment confirmation flow.',
 'https://shop.example.com', 'chromium', 'completed', 18450, now() - INTERVAL '30 minutes')
ON CONFLICT (id) DO NOTHING;

-- ─── 8. Bugs (auto-created from failed runs) ────────────────────────────────
INSERT INTO public.bugs (id, project_id, test_run_id, title, description, severity, status, steps_to_reproduce) VALUES
(v_bug_1, v_project_1, v_run_2, 'Login error message not displayed on Firefox',
 'When entering wrong credentials on Firefox, the .error-message element is not rendered. The assertion for visibility fails consistently. This appears to be a CSS rendering issue specific to Firefox where the error toast has display:none.',
 'high', 'open',
 '[{"step":1,"description":"Navigate to /login using Firefox"},{"step":2,"description":"Enter valid email and wrong password"},{"step":3,"description":"Click submit button"},{"step":4,"description":"Observe: error message element exists in DOM but is not visible"}]'::jsonb),
(v_bug_2, v_project_1, v_run_5, 'Payment gateway timeout on WebKit',
 'Checkout payment step times out after ~8 seconds on WebKit browser. The pay-now button click does not complete within the expected timeframe. Likely a WebKit-specific issue with the Stripe.js integration or the payment iframe not loading properly.',
 'critical', 'open',
 '[{"step":1,"description":"Add item to cart and proceed to checkout"},{"step":2,"description":"Fill in valid payment details (test card 4242...)"},{"step":3,"description":"Click Pay Now button"},{"step":4,"description":"Observe: button click hangs for ~8s then times out"}]'::jsonb),
(v_bug_3, v_project_2, v_run_8, 'User creation form resets on tab switch in Firefox',
 'When creating a new user in the admin panel on Firefox, switching browser tabs and returning causes the form to reset. All filled fields are cleared and the role selection reverts to default. This only occurs in Firefox — Chromium retains form state correctly.',
 'medium', 'in_progress',
 '[{"step":1,"description":"Navigate to /admin/users and click Create User"},{"step":2,"description":"Fill in email, name, and select role"},{"step":3,"description":"Switch to another browser tab, wait 5 seconds"},{"step":4,"description":"Switch back to the admin tab"},{"step":5,"description":"Observe: all form fields are empty"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

END $$;
