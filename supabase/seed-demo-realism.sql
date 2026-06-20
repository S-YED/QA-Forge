-- =============================================================================
-- QA Forge — Demo Realism Seed  (additive, idempotent)
-- =============================================================================
-- Adds a real, coherent project for https://www.syedkm.com built from captured
-- screenshots in apps/web/public/demo/, seeds a "present" AI key for the demo
-- account, adds a playable recorded session, and replaces the placehold.co
-- screenshots on the existing seeded runs with the real captures.
--
-- Run locally:
--   docker exec -i <supabase_db_container> psql -U postgres -d postgres < supabase/seed-demo-realism.sql
-- =============================================================================

DO $$
DECLARE
    v_demo_user UUID := '00000000-0000-0000-0000-000000000099';
    v_project_4 UUID := '10000000-0000-0000-0000-000000000004';
    v_suite_6   UUID := '20000000-0000-0000-0000-000000000006';
    v_suite_7   UUID := '20000000-0000-0000-0000-000000000007';
    v_suite_8   UUID := '20000000-0000-0000-0000-000000000008';
    v_case_9    UUID := '30000000-0000-0000-0000-000000000009';
    v_case_10   UUID := '30000000-0000-0000-0000-000000000010';
    v_case_11   UUID := '30000000-0000-0000-0000-000000000011';
    v_case_12   UUID := '30000000-0000-0000-0000-000000000012';
    v_case_13   UUID := '30000000-0000-0000-0000-000000000013';
    v_case_14   UUID := '30000000-0000-0000-0000-000000000014';
    v_run_11    UUID := '40000000-0000-0000-0000-000000000011';
    v_run_12    UUID := '40000000-0000-0000-0000-000000000012';
    v_run_13    UUID := '40000000-0000-0000-0000-000000000013';
    v_run_14    UUID := '40000000-0000-0000-0000-000000000014';
    v_run_15    UUID := '40000000-0000-0000-0000-000000000015';
    v_run_16    UUID := '40000000-0000-0000-0000-000000000016';
    v_run_17    UUID := '40000000-0000-0000-0000-000000000017';
    v_session_2 UUID := '50000000-0000-0000-0000-000000000002';
    v_bug_4     UUID := '60000000-0000-0000-0000-000000000004';
    v_key_1     UUID := '70000000-0000-0000-0000-000000000001';
BEGIN

-- ─── Featured project: syedkm.com ───────────────────────────────────────────
INSERT INTO public.projects (id, user_id, name, description, base_url) VALUES
(v_project_4, v_demo_user, 'syedkm.com Portfolio',
 'End-to-end coverage for the live portfolio site: homepage, navigation (home / blog / resume), content sections, contact links, and the responsive mobile layout.',
 'https://www.syedkm.com')
ON CONFLICT (id) DO NOTHING;

-- ─── Suites ─────────────────────────────────────────────────────────────────
INSERT INTO public.test_suites (id, project_id, parent_suite_id, name, description) VALUES
(v_suite_6, v_project_4, NULL, 'Smoke & navigation', 'Homepage loads and the top navigation (home / blog / resume) routes correctly.'),
(v_suite_7, v_project_4, NULL, 'Content sections', 'Skills, experience, and projects sections render the expected content.'),
(v_suite_8, v_project_4, NULL, 'Contact & responsive', 'Contact links resolve and the layout holds up on mobile widths.')
ON CONFLICT (id) DO NOTHING;

-- ─── Test cases (coherent with the real site) ───────────────────────────────
INSERT INTO public.test_cases (id, suite_id, title, description, steps, expected_result, priority, type, tags, is_ai_generated, source) VALUES
(v_case_9, v_suite_6, 'Homepage loads with hero and intro',
 'Verifies the landing hero renders the greeting, intro copy, and primary action buttons.',
 '[{"step_number":1,"instruction":"navigate","value":"/"},{"step_number":2,"instruction":"assert","selector":"h1","value":"Hey there!"},{"step_number":3,"instruction":"assert","selector":"nav","value":"visible"},{"step_number":4,"instruction":"assert","selector":"a.view-resume","value":"visible"}]'::jsonb,
 'Hero greeting, intro paragraph, and the View Resume / Email / GitHub buttons are visible.', 'critical', 'smoke', ARRAY['smoke','home','hero'], false, 'manual'),
(v_case_10, v_suite_6, 'Top navigation routes to Blog and Resume',
 'Clicks the blog and resume links and verifies each route renders.',
 '[{"step_number":1,"instruction":"navigate","value":"/"},{"step_number":2,"instruction":"click","selector":"nav a[href=\"/blog\"]"},{"step_number":3,"instruction":"assert","selector":"main","value":"visible"},{"step_number":4,"instruction":"navigate","value":"/resume"},{"step_number":5,"instruction":"assert","selector":"main","value":"visible"}]'::jsonb,
 'Blog and Resume pages both load without errors.', 'high', 'functional', ARRAY['navigation','routing'], false, 'manual'),
(v_case_11, v_suite_7, 'Skills section lists the tech stack',
 'Scrolls to the skills section and verifies key tools are listed.',
 '[{"step_number":1,"instruction":"navigate","value":"/"},{"step_number":2,"instruction":"scroll","selector":"#skills"},{"step_number":3,"instruction":"assert","selector":"#skills","value":"Playwright"},{"step_number":4,"instruction":"assert","selector":"#skills","value":"Selenium"}]'::jsonb,
 'The skills section lists Playwright, Selenium, and the cloud / DevOps stack.', 'medium', 'functional', ARRAY['content','skills'], true, 'ai_generated'),
(v_case_12, v_suite_7, 'Projects section features QA Forge',
 'Verifies the projects grid includes the QA Forge card with its tags.',
 '[{"step_number":1,"instruction":"navigate","value":"/"},{"step_number":2,"instruction":"scroll","selector":"#projects"},{"step_number":3,"instruction":"assert","selector":"#projects","value":"QA Forge"},{"step_number":4,"instruction":"assert","selector":".project-card","value":"visible"}]'::jsonb,
 'The QA Forge project card is present with AI / CI-CD / test-automation tags.', 'high', 'functional', ARRAY['content','projects'], true, 'ai_generated'),
(v_case_13, v_suite_8, 'Contact email link is present and correct',
 'Scrolls to the contact section and verifies the mailto link points to the right address.',
 '[{"step_number":1,"instruction":"navigate","value":"/"},{"step_number":2,"instruction":"scroll","selector":"#contact"},{"step_number":3,"instruction":"assert","selector":"a[href^=\"mailto:\"]","value":"skm.exec@gmail.com"}]'::jsonb,
 'A mailto link to skm.exec@gmail.com is visible in the contact section.', 'medium', 'functional', ARRAY['contact','links'], false, 'manual'),
(v_case_14, v_suite_8, 'Mobile layout renders hero and navigation',
 'Loads the homepage at a mobile width and verifies the hero and nav remain usable.',
 '[{"step_number":1,"instruction":"navigate","value":"/"},{"step_number":2,"instruction":"assert","selector":"h1","value":"visible"},{"step_number":3,"instruction":"assert","selector":"nav","value":"visible"}]'::jsonb,
 'Hero and navigation render correctly at 414px width with no overflow.', 'medium', 'accessibility', ARRAY['responsive','mobile'], true, 'ai_generated')
ON CONFLICT (id) DO NOTHING;

-- ─── Runs (terminal — replayed with realistic timing by the UI) ─────────────
INSERT INTO public.test_runs (id, test_case_id, project_id, user_id, status, mode, browser, environment, duration_ms, started_at, completed_at) VALUES
(v_run_11, v_case_9,  v_project_4, v_demo_user, 'passed', 'ai_driven',        'chromium', 'production', 3420, now() - INTERVAL '90 minutes', now() - INTERVAL '90 minutes' + INTERVAL '3420 milliseconds'),
(v_run_12, v_case_10, v_project_4, v_demo_user, 'passed', 'ai_driven',        'chromium', 'production', 4180, now() - INTERVAL '80 minutes', now() - INTERVAL '80 minutes' + INTERVAL '4180 milliseconds'),
(v_run_13, v_case_11, v_project_4, v_demo_user, 'passed', 'ai_driven',        'firefox',  'production', 2960, now() - INTERVAL '70 minutes', now() - INTERVAL '70 minutes' + INTERVAL '2960 milliseconds'),
(v_run_14, v_case_12, v_project_4, v_demo_user, 'passed', 'ai_driven',        'chromium', 'production', 3510, now() - INTERVAL '55 minutes', now() - INTERVAL '55 minutes' + INTERVAL '3510 milliseconds'),
(v_run_15, v_case_13, v_project_4, v_demo_user, 'failed', 'ai_driven',        'webkit',   'production', 5240, now() - INTERVAL '40 minutes', now() - INTERVAL '40 minutes' + INTERVAL '5240 milliseconds'),
(v_run_16, v_case_14, v_project_4, v_demo_user, 'passed', 'ai_driven',        'chromium', 'production', 2780, now() - INTERVAL '25 minutes', now() - INTERVAL '25 minutes' + INTERVAL '2780 milliseconds'),
(v_run_17, v_case_9,  v_project_4, v_demo_user, 'passed', 'manual_recording', 'chromium', 'production', 3990, now() - INTERVAL '15 minutes', now() - INTERVAL '15 minutes' + INTERVAL '3990 milliseconds')
ON CONFLICT (id) DO NOTHING;

-- ─── Steps (screenshots are real captures of the live site) ─────────────────
INSERT INTO public.test_steps (test_run_id, step_number, action, selector, value, status, duration_ms, screenshot_url) VALUES
-- run 11 (homepage hero — passed)
(v_run_11, 1, 'navigate', NULL,            '/',            'passed', 612, '/demo/syedkm-01.png'),
(v_run_11, 2, 'assert',   'h1',            'Hey there!',   'passed', 140, '/demo/syedkm-01.png'),
(v_run_11, 3, 'assert',   'nav',           'visible',      'passed', 96,  '/demo/syedkm-01.png'),
(v_run_11, 4, 'assert',   'a.view-resume', 'visible',      'passed', 88,  '/demo/syedkm-01.png'),
-- run 12 (navigation — passed)
(v_run_12, 1, 'navigate', NULL,                    '/',     'passed', 540, '/demo/syedkm-01.png'),
(v_run_12, 2, 'click',    'nav a[href="/blog"]',   NULL,    'passed', 880, '/demo/syedkm-blog.png'),
(v_run_12, 3, 'assert',   'main',                  'visible','passed', 210, '/demo/syedkm-blog.png'),
(v_run_12, 4, 'navigate', NULL,                    '/resume','passed', 760, '/demo/syedkm-resume.png'),
(v_run_12, 5, 'assert',   'main',                  'visible','passed', 190, '/demo/syedkm-resume.png'),
-- run 13 (skills — passed)
(v_run_13, 1, 'navigate', NULL,      '/',          'passed', 580, '/demo/syedkm-01.png'),
(v_run_13, 2, 'scroll',   '#skills', NULL,         'passed', 420, '/demo/syedkm-02.png'),
(v_run_13, 3, 'assert',   '#skills', 'Playwright', 'passed', 150, '/demo/syedkm-02.png'),
(v_run_13, 4, 'assert',   '#skills', 'Selenium',   'passed', 130, '/demo/syedkm-02.png'),
-- run 14 (projects — passed)
(v_run_14, 1, 'navigate', NULL,            '/',        'passed', 560, '/demo/syedkm-01.png'),
(v_run_14, 2, 'scroll',   '#projects',     NULL,       'passed', 510, '/demo/syedkm-04.png'),
(v_run_14, 3, 'assert',   '#projects',     'QA Forge', 'passed', 160, '/demo/syedkm-04.png'),
(v_run_14, 4, 'assert',   '.project-card', 'visible',  'passed', 120, '/demo/syedkm-04.png'),
-- run 15 (contact — failed on webkit)
(v_run_15, 1, 'navigate', NULL,                    '/',                  'passed', 640, '/demo/syedkm-01.png'),
(v_run_15, 2, 'scroll',   '#contact',              NULL,                 'passed', 700, '/demo/syedkm-05.png'),
(v_run_15, 3, 'assert',   'a[href^="mailto:"]',    'skm.exec@gmail.com', 'failed', 3900,'/demo/syedkm-05.png'),
-- run 16 (mobile — passed)
(v_run_16, 1, 'navigate', NULL, '/',       'passed', 520, '/demo/syedkm-mobile.png'),
(v_run_16, 2, 'assert',   'h1', 'visible', 'passed', 130, '/demo/syedkm-mobile.png'),
(v_run_16, 3, 'assert',   'nav','visible', 'passed', 110, '/demo/syedkm-mobile.png'),
-- run 17 (recorded homepage walkthrough — passed)
(v_run_17, 1, 'navigate', NULL,      '/',          'passed', 600, '/demo/syedkm-01.png'),
(v_run_17, 2, 'scroll',   '#skills', NULL,         'passed', 700, '/demo/syedkm-02.png'),
(v_run_17, 3, 'scroll',   '#experience', NULL,     'passed', 720, '/demo/syedkm-03.png'),
(v_run_17, 4, 'scroll',   '#projects', NULL,       'passed', 690, '/demo/syedkm-04.png'),
(v_run_17, 5, 'assert',   '#projects', 'QA Forge', 'passed', 180, '/demo/syedkm-04.png')
ON CONFLICT DO NOTHING;

-- ─── Bug (from the failed webkit contact run) ───────────────────────────────
INSERT INTO public.bugs (id, project_id, test_run_id, title, description, severity, status, steps_to_reproduce) VALUES
(v_bug_4, v_project_4, v_run_15, 'Contact mailto link not detected on WebKit',
 'On WebKit the assertion for the mailto contact link times out. The link renders visually but the selector a[href^="mailto:"] does not resolve within the timeout, suggesting the anchor href is applied late by client-side hydration on WebKit only.',
 'medium', 'open',
 '[{"step":1,"description":"Open https://www.syedkm.com on WebKit"},{"step":2,"description":"Scroll to the contact section"},{"step":3,"description":"Wait for the mailto link assertion"},{"step":4,"description":"Observe: link is visible but the selector resolves after the timeout"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ─── Recorded session (playable: each action carries a real frame) ──────────
INSERT INTO public.recorded_sessions (id, project_id, user_id, name, description, base_url, browser, status, duration_ms, completed_at) VALUES
(v_session_2, v_project_4, v_demo_user, 'Homepage walkthrough',
 'Captured walkthrough of the portfolio: hero, skills, experience, projects, and the resume route.',
 'https://www.syedkm.com', 'chromium', 'completed', 16800, now() - INTERVAL '20 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.session_actions (session_id, action_number, action_type, selector, value, url, timestamp_ms, metadata) VALUES
(v_session_2, 1, 'navigate', NULL,                  '/',          'https://www.syedkm.com/',       600,   '{"screenshot":"/demo/syedkm-01.png"}'::jsonb),
(v_session_2, 2, 'scroll',   '#skills',             NULL,         'https://www.syedkm.com/',       3200,  '{"screenshot":"/demo/syedkm-02.png"}'::jsonb),
(v_session_2, 3, 'scroll',   '#experience',         NULL,         'https://www.syedkm.com/',       6100,  '{"screenshot":"/demo/syedkm-03.png"}'::jsonb),
(v_session_2, 4, 'scroll',   '#projects',           NULL,         'https://www.syedkm.com/',       9300,  '{"screenshot":"/demo/syedkm-04.png"}'::jsonb),
(v_session_2, 5, 'click',    'nav a[href="/resume"]', NULL,       'https://www.syedkm.com/resume', 12400, '{"screenshot":"/demo/syedkm-resume.png"}'::jsonb),
(v_session_2, 6, 'navigate', NULL,                  '/',          'https://www.syedkm.com/',       15600, '{"screenshot":"/demo/syedkm-05.png"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ─── A "present" AI key for the demo account ────────────────────────────────
-- encrypted_key is a placeholder (demo cannot validate/decrypt — validate is a
-- blocked write), but the key shows as present + valid in Settings → AI keys.
INSERT INTO public.api_keys (id, user_id, provider, encrypted_key, key_hint, is_valid) VALUES
(v_key_1, v_demo_user, 'openai', 'demo-not-decryptable', 'sk-proj-••••aF92', true)
ON CONFLICT (user_id, provider) DO NOTHING;

-- ─── Replace placeholder screenshots on the original runs with real captures ─
UPDATE public.test_steps
SET screenshot_url = '/demo/syedkm-0' || ((((step_number - 1) % 5) + 1)) || '.png'
WHERE screenshot_url LIKE 'https://placehold.co%';

END $$;
