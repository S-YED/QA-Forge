# QA Forge release notes

## v1.0, December 2026 (draft of 18 November 2026)

This draft lists what the December release contains today. Every item is verified, and where it was verified is in
brackets: **production** (checked on https://qa-forge-gamma.vercel.app), **CI** (both CI runs green and live in
production, but not exercised there), or **local** (local build and full test suites only). The evidence for each
ticket is in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). The final pass, the tag and a refresh of these notes
are planned for 28 to 31 December ([roadmap](../docs/DECEMBER_2026_ROADMAP.md), phase 8).

### Write tests

- **Plain-English steps.** The step editor reads sentences such as `Click "Log in"` or `Type "ada@example.com" into
  Email` into steps; an element's words are enough, selectors are optional. Enter adds a step, pasting several lines
  adds several steps, Ctrl+Enter saves, and closing with unsaved changes asks first. (U3, CON-1; production)
- **AI drafts, reviewed before saving.** Describe a feature and get draft cases from your own OpenAI, Anthropic,
  Gemini or OpenRouter key. Nothing is saved until you approve it. Without a key, a built-in local generator makes
  clearly labelled demo drafts. (AI-2, AI-3; local)
- **Record a flow** by clicking and typing in a live browser, then replay it as a case; replaying again updates the
  same case. Recordings can be deleted. (G3 production; G8 CI; DD-3 production: recordings use Chromium)
- **Variables and secrets.** `{{NAME}}` in a step is filled in at run time; secret values never appear in steps, logs,
  bugs or exported scripts. (F4; production)
- **Organise.** Search cases by title or step, duplicate, move between suites, reorder steps; filter runs and bugs by
  status and date. Sub-suites appear under their parent suite. (F6, G4; production)
- **Export** a case or a whole suite as a Playwright file, or a suite as a spreadsheet. (F11; production)

### Run tests

- **Live runs in Chromium**, step by step, with a screenshot per step, a live log, and a one-line result at the top of
  the run page with the next actions beside it. (RUN-1, UI-1, U2; production)
- **Stop** a running test, **run it again** from the run page or the Runs list. (F1 local, F2 production)
- **Run a whole suite** case by case, with live totals and Stop all. (F3; production)
- **Schedule** a suite daily or weekly. (F9; production)
- **Run from CI** (for example GitHub Actions) with a project token that is shown once and can be deleted. (F8;
  production)
- **Slack notice** when a suite run ends with a failure. (F10; settings verified in production, sending tested with
  Slack replaced; a message arriving in a real Slack channel has not been seen yet, see below)
- A live run or recording page that loses its connection comes back with the current sign-in. (G7; production)

### See results

- **Project overview**: pass rate over 30 days, runs per day, what is failing now, unstable cases; each case shows its
  last result. (F5; production)
- **Failure evidence**: a failed step shows its error, the page address, console errors, failed requests and the
  screenshot, and the auto-filed bug carries the same. (F7; production)
- **Bugs**: each bug opens on its own with its evidence and a link to the run that found it; bugs can be filed by hand.
  A step blocked by the address guard ends the run as an error and files no bug. (G5, G6; production)

### Accounts

- Sign up, sign in, sign out; change your name and avatar, and clear them. (DD-2; production)
- **Forgot password** sends a link to a page where you set a new one. (DD-5; production, but see the Supabase setting
  below)
- **Change your password** in Settings, Profile. (G1; production)
- **Delete your account** and everything in it, including screenshots and any run in progress. (G2; CI, and in
  production the route, the card and the demo's note were checked without deleting an account)
- A **read-only demo**: no sign-up, nothing can be changed, and one visitor cannot lock out the next. (DD-2, SEC-5; CI
  and production)

### Safety

- Runs cannot open private network addresses (up-front checks plus a browser-level guard). (SEC-3; local)
- API keys and secret variables are encrypted with AES-256-GCM; plaintext keys are never returned or logged. (local)
- Row-Level Security on every table, checked by the cross-user and RLS test suites. (SEC-1, SEC-2; local)
- Rate limits count the real visitor behind Railway's proxies. (SEC-4; production)
- Deleting a project or an account stops its runs and removes its screenshots. (G10, G2; CI)

### Fixed since the 14 November plan

Each was found by the code review, the user-story deep dive (17 November) or the production checks:
recording stops that dropped actions (CR-1), sign-in checked twice per request (CR-2), bad requests answered as server
errors (DD-1), profile fields that would not clear (DD-2), Firefox and WebKit recordings that could not replay (DD-3),
a missing recording opening an empty page (DD-4), a password reset with nowhere to set the password (DD-5), API edge
cases (G6), duplicate replay cases (G8), a Stop race (G9), screenshots left behind by project deletion (G10), a bug
panel without padding, "1 steps" and similar counts, an Integrations page that called live features "planned", hidden
project tabs on phones (U5, U6), and landing copy that claimed Firefox and WebKit runs (U7). U5 to U7 are verified in production (U7 for the landing page; the demo part waits for DEMO-1).

## Known limitations

- **Chromium only.** Runs and recordings use Chromium; the API refuses any other browser (DD-3 production; G11 local, reaching production with the next push).
- **Slack**: a real message in a real channel has not been seen yet; the Integrations page keeps "Soon" until it has
  (F10).
- **Password reset in production** needs the Supabase Auth URL setting below; until then the emailed link goes to the
  site address (DD-5).
- **The demo** has projects, suites, runs, screenshots, a bug and a recording, but no suite runs, and its seed data
  still targets outside sites rather than the demo shop (DEMO-1).
- **Running a parent suite** runs only its own cases; each sub-suite has its own Run button (G4, open question).
- **Speed**: signed-in pages take 0.5 to 2 s per API call because the API (Railway) and the database (Sydney) are far
  apart (UX-3).
- **Address guard ceiling**: WebKit may bypass the browser-level guard for loopback addresses; production does not
  install WebKit, and the up-front checks still apply (SEC-3, TD-8).
- Development only: rare local test flakes (QA-2), 21 lint warnings (CI-1), test files compiled into `apps/api/dist`
  (P1), a Windows path-length limit for very deep clone paths (REL-1).

## Before the release (owner)

1. In Supabase Auth, URL Configuration, allow `https://qa-forge-gamma.vercel.app/reset-password` as a redirect URL
   (DD-5).
2. Add billing to Railway before the trial ends, about 10 December (REL-3).
3. Move the Railway service to the Southeast Asia region (UX-3).
4. Rotate the keys created in June.
5. Connect a real Slack test channel so the first real notice can be seen (F10).
6. Decide the demo seed data (DEMO-1), and whether running a parent suite should include its sub-suites (G4).
