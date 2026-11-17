# Known Issues (open)

Full descriptions: [docs/CURRENT_STATE_AUDIT.md](../docs/CURRENT_STATE_AUDIT.md). Remove rows when the fixing
ticket is **Verified** in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

| Severity | Issue | Ticket |
|---|---|---|
| LOW | Windows: a clone under a very deep path (over ~115 characters) fails to start vitest because pnpm paths exceed 260 characters; setup guide says to clone to a short path or enable long paths | REL-1 (documented) |
| LOW | Rare local integration flakes in real-browser run tests: SEC-3 "private host ... as error" (1 of 6 full runs) and RUN-1 "a passing case ends passed" (1 of 4), 8 Nov; F3 "runs every case in order" (1 of 5 full runs, 17 Nov, failed in 1.7 s; only its name was captured). Each passed alone and in every rerun; CI green on every push. Ruled out: the dev API's boot reaper (no reaps logged). F1 "a stop that arrives as the last step finishes" failed once in CI on 17 Nov (d04467d) with "An invalid response was received from the upstream server" from CI's local Supabase gateway, and passed on re-run. Cause not found; watch CI, and keep full logs when it recurs | QA-2 |
| LOW | Railway trial ends about 10 Dec 2026 or when its credit runs out (seen 11 Nov: "29 days or $4.86 left"); the API stops then unless billing is added (owner) | REL-3 |
| LOW | Production latency: authenticated API calls take 0.5–2 s because Railway and Supabase (Sydney) are far apart; Vercel is pinned to syd1, Railway region still to move to Southeast Asia (user action) | UX-3 |
| MED | Seeds still target syedkm.com/example.com, not the demo shop (README/setup guide fixed in DOC-1) | DEMO-1 |
| MED | SSRF guard: WebKit may bypass the proxy for loopback (up-front URL checks still apply). Prod: keep `ALLOW_PRIVATE_HOSTS` unset | SEC-3 (ceiling, TD-8) |
| LOW | 21 `no-explicit-any` lint warnings in `apps/api`; Next.js ESLint plugin not configured | CI-1 |
| LOW | Test files compile into `apps/api/dist` (inert, but shipped) | P1 |
| LOW | CI is pinned to `ubuntu-24.04`: on 17 Nov `ubuntu-latest` became 26.04, where this Playwright version cannot install Chromium. Move on when a Playwright upgrade supports 26.04 | CI-1 |
| MED | F10 Slack notice: a real message arriving in a real Slack channel has not been seen yet (settings verified in production; sending tested with Slack replaced). Integrations page keeps "Soon" until it has (owner: connect a test channel) | F10 |
| LOW | Stop pressed in the instant a run is being picked up can close its row as "Stopped" while the browser still runs that case to the end (the stop route closes runs not yet in this process's in-flight list; seen in the 17 Nov code review, not observed) | G9 |
| LOW | Each replay of a recording adds another "Replay of recording: ..." case to the "Replayed Session Tests" suite | G8 |
| MED | Password reset in production needs Supabase Auth (URL Configuration) to allow `https://qa-forge-gamma.vercel.app/reset-password`; until then the emailed link falls back to the site address (owner) | DD-5 |
| LOW | No way to delete your account | G2 |
| LOW | Child suites can be made through the API but the app never shows them or their cases | G4 |
| LOW | Bugs cannot be filed by hand or opened on their own in the app (the API can); a bug opens its run | G5 |
| LOW | Small API edges from the 17 Nov probe: a step blocked by the address guard files a bug against the app; a suite run on a project with no base address starts and errors case by case; assigning a bug to an unknown person says "Bug not found"; hand-written cases have no cap on tags | G6 |
| LOW | A run page open for over an hour keeps its first sign-in token on the live connection, so a reconnect after that may be refused (read in the code, not reproduced) | G7 |
| LOW | Docker Desktop on this Windows host can hang with WSL (6 to 8 Nov; fixed by a reboot). `pnpm check-setup` now detects and explains it | — |
