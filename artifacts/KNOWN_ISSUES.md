# Known Issues (open)

Full descriptions: [docs/CURRENT_STATE_AUDIT.md](../docs/CURRENT_STATE_AUDIT.md). Remove rows when the fixing
ticket is **Verified** in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

| Severity | Issue | Ticket |
|---|---|---|
| LOW | Windows: a clone under a very deep path (over ~115 characters) fails to start vitest because pnpm paths exceed 260 characters; setup guide says to clone to a short path or enable long paths | REL-1 (documented) |
| LOW | Rare local integration flakes in real-browser run tests: SEC-3 "private host ... as error" (1 of 6 full runs) and RUN-1 "a passing case ends passed" (1 of 4), 8 Nov; F3 "runs every case in order" (1 of 5 full runs, 17 Nov, failed in 1.7 s; only its name was captured). Each passed alone and in every rerun; CI green on every push. Ruled out: the dev API's boot reaper (no reaps logged). F1 "a stop that arrives as the last step finishes" failed once in CI on 17 Nov (d04467d) with "An invalid response was received from the upstream server" from CI's local Supabase gateway, and passed on re-run; the same test failed the same way once more on 19 Nov (23f3871, pull-request run) and passed on re-run. 20 Nov: a full local run marked recording.int.test.ts failed at file level while all 104 tests passed; it passed alone and in a full rerun (the error text was not kept). 20 Nov: notifications "a notice that cannot be delivered" counted 0 failed notices once and passed on rerun. Cause not found; watch CI, and keep full logs when it recurs | QA-2 |
| LOW | Railway trial ends about 10 Dec 2026 or when its credit runs out (seen 11 Nov: "29 days or $4.86 left"; 20 Nov: "21 days or $4.65 left"); the API stops then unless billing is added (owner) | REL-3 |
| LOW | Production latency: signed-in API calls take about 0.4 to 0.75 s (medians, 20 Nov, after PERF-1: `/projects` 391 ms, one project 737 ms, its runs 694 ms; `/health` 57 ms). PERF-1 removed the call to Supabase Auth on every request; what is left is the routes' own database round trips to Supabase in Sydney from Railway in Southeast Asia. Next step if it matters: fewer queries per route, or the database and API in one region | UX-3 |
| MED | SSRF guard: WebKit may bypass the proxy for loopback (up-front URL checks still apply). Prod: keep `ALLOW_PRIVATE_HOSTS` unset | SEC-3 (ceiling, TD-8) |
| LOW | 21 `no-explicit-any` lint warnings in `apps/api`; Next.js ESLint plugin not configured | CI-1 |
| LOW | Test files compile into `apps/api/dist` (inert, but shipped) | P1 |
| LOW | CI is pinned to `ubuntu-24.04`: on 17 Nov `ubuntu-latest` became 26.04, where this Playwright version cannot install Chromium. Move on when a Playwright upgrade supports 26.04 | CI-1 |
| MED | F10 Slack notice: held as "Coming soon" by the owner (20 Nov) until a real message has reached a real Slack channel. The Automation tab shows the section with a "Coming soon" badge and no address field; a web build with `NEXT_PUBLIC_SLACK_NOTICES=on` shows the settings for that test (owner: connect a test channel) | F10 |
| LOW | Production auth email uses Supabase's built-in mail, at most 2 messages an hour. The owner reports (20 Nov) that sign-up works for any address and accepts the limit for demoing the prototype; custom SMTP in Supabase Auth before wider use | G12 |
| LOW | Keys created in June are not rotated yet; the owner rotates them later (20 Nov) | — |
| LOW | Docker Desktop on this Windows host can hang with WSL (6 to 8 Nov; fixed by a reboot). `pnpm check-setup` now detects and explains it | — |
