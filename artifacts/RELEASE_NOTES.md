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
  status and date. Sub-suites appear under their parent suite, and running the parent runs them too. (F6, G4;
  production; running with sub-suites: local)
- **Export** a case or a whole suite as a Playwright file, or a suite as a spreadsheet. (F11; production)

### Run tests

- **Live runs in Chromium**, step by step, with a screenshot per step, a live log, and a one-line result at the top of
  the run page with the next actions beside it. (RUN-1, UI-1, U2; production)
- **Stop** a running test, **run it again** from the run page or the Runs list. (F1 local, F2 production)
- **Run a whole suite** case by case, with live totals and Stop all. (F3; production)
- **Schedule** a suite daily or weekly. (F9; production)
- **Run from CI** (for example GitHub Actions) with a project token that is shown once and can be deleted. (F8;
  production)
- **Slack notice** when a suite run ends with a failure: coming soon. It is built and tested with Slack replaced, and
  shows as "Coming soon" until a message has reached a real Slack channel. (F10; owner's call, 20 November)
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
- **Forgot password** sends a link to a page where you set a new one. (DD-5; production, and Supabase allows the
  link's page since 19 November, but see email delivery below)
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

The code review of 19 November found 15 more; 14 are fixed, tested and in production (CR-3 to CR-16): a run stopped
while its browser was starting, a sign-in repair that ran on any sign-in error, a failed database read mid-run that
abandoned the run, bug steps shown as raw JSON, a narrow new-password form, a stopped run whose live page kept waiting,
a confirm box that stayed open after leaving the page and lost the focus, replays found by description rather than a
link (migration 32), a scheduled run of a project with no address, a shutdown that left waiting runs open, a recording
closed during start-up that kept recording, and HTTPS hops to private addresses reported as test failures. The
end-to-end pass of 20 November found one more: a hovered primary button's label fell below AA contrast (A11Y-1; local).

## Known limitations

- **Chromium only.** Runs and recordings use Chromium; the API refuses any other browser (DD-3 and G11; production).
- **Slack** notices show as "Coming soon" until a real message has reached a real channel (F10).
- **Email in production** (sign-up confirmation, password reset) goes through Supabase's built-in mail, at most 2
  messages an hour. The owner has seen sign-up work for any address and accepts the limit for demoing the prototype;
  custom SMTP comes before wider use (G12).
- **AI generation in production needs the user's own AI key.** Without one, AI generate says to add a key in Settings.
  The labelled local demo drafts (no AI) are a local-development switch, `AI_LOCAL_DEMO`, which is off in production.
- **The demo** stays read-only for visitors. Its "Demo shop" project is tested for real every morning against a
  hosted demo shop (eleven cases pass, a planted coupon bug fails and files a bug); 30 days of suite runs are kept.
  (DEMO-1; production)
- **Repeated failures** file a new bug on every run: a nightly schedule with a failing case opens a bug a night (G13).
- **Speed**: signed-in pages take 0.5 to 2 s per API call because the API (Railway) and the database (Sydney) are far
  apart (UX-3).
- **Address guard ceiling**: WebKit may bypass the browser-level guard for loopback addresses; production does not
  install WebKit, and the up-front checks still apply (SEC-3, TD-8).
- **A failed session read** makes a live page wait 45 s before it says so (CR-17, the last open review finding).
- Development only: rare local test flakes (QA-2), 21 lint warnings (CI-1), test files compiled into `apps/api/dist`
  (P1), a Windows path-length limit for very deep clone paths (REL-1).

## Before the release (owner)

1. Before wider use, not needed for the prototype demo (owner, 20 November): set up custom SMTP in Supabase Auth (an
   email provider and a sending domain) to lift the 2-an-hour email limit (G12). The reset redirect URL is allowed
   since 19 November (DD-5).
2. Add billing to Railway before the trial ends, about 10 December (REL-3).
3. Done 20 November: the Railway service runs in Southeast Asia. Signed-in calls still take about 1 s because the
   database is in Sydney (UX-3).
4. Rotate the keys created in June (later, owner's call 20 November).
5. Connect a real Slack test channel, build the web app with `NEXT_PUBLIC_SLACK_NOTICES=on`, and see the first real
   notice; then set it in Vercel to switch Slack on for everyone (F10).
6. Done 20 November: the demo shop is online and `DEMO_SHOP_URL` is set (DEMO-1). Decided on 19 November: the demo tests the
   demo shop with a daily suite run (DEMO-1, 1A and 2A), and running a parent suite includes its sub-suites (G4).
