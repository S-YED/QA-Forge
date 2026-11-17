# User stories tested (deep dive, 17 Nov 2026)

How each story was exercised and what was found. **Probe** = scripted API calls against the local API
(`localhost:4000`, local Supabase, two users and the demo account); **Browser** = gstack browse against the
local production build (`localhost:3005`); **Suite** = the named automated test. Fixes are tickets in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); open items are in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Account and access

| Story | How tested | Result |
|---|---|---|
| Sign up with an email and land on Projects | Suite: E2E registration | Works |
| Wrong password is refused with a message | Browser | Works ("Invalid login credentials") |
| Forgot my password: get a link, set a new one, sign in with it | Browser (local test inbox), then E2E | **Was broken**: the link signed you in once and there was no page to set a password. Fixed in DD-5 |
| Change my password while signed in | Code | Was a gap. Built in G1 |
| Signed out, open the dashboard | Browser | Works: sent to sign-in |
| Sign out | Browser | Works |
| Edit my name and avatar, and clear them | Browser, Probe | **Was broken**: clearing said "updated" but kept the old value. Fixed in DD-2 |
| Raise my own role | Probe (a tester account) | Refused: role unchanged |
| Delete my account | Code | **Gap**: not offered |
| Demo visitor cannot change anything | Probe, Browser | **Was broken** for the profile: any visitor could rename the shared demo account. Fixed in DD-2. Every other write answers 403 |

## Projects, suites and cases

| Story | How tested | Result |
|---|---|---|
| Create a project; bad names and `javascript:`/`file:` addresses refused | Probe | Works |
| Open a malformed, unknown or another user's project link | Browser, Probe | Works: back to Projects; the API answers 400/404 |
| Delete a project while its suite run is running, with a schedule and a CI token | Probe | Works: the run ends, the token stops (401), the API stays up |
| Suites: empty name, nesting deeper than one level, a suite as its own parent | Probe | Refused |
| Child suites | Probe, Code | **Gap**: the API creates them but the app never shows them or their cases |
| Write a case: unknown action, missing value, over 100 steps (tried 300), 501-character title, numeric tags | Probe | Refused with field messages |
| 500 tags of 1,000 characters each on a hand-written case | Probe | Accepted (AI drafts are capped at 20 tags of 50; hand-written cases have no cap; low) |
| A case whose steps repeat a step number (an AI draft can do this) | Probe | Runs and passes |
| Unknown fields in an edit (`is_ai_generated`) | Probe | Ignored, not written |
| Search with `%`, `_` and quotes | Probe | Matched literally, no filter injection |

## Runs and suite runs

| Story | How tested | Result |
|---|---|---|
| Three runs at once (limit is two) | Probe | Two pass, the third ends with "Too many concurrent runs" |
| Delete the case while its run is running | Probe | The run ends (failed at the step that times out) |
| Run on a project with no base address | Probe | Ends at once with "Project has no base URL configured" |
| Suite run on a project with no base address | Probe | Started and each case then ended with that error. Fixed in G6: refused up front (400) |
| A step that opens `javascript:` or a private address | Probe | Blocked, but recorded as a failed step with a bug filed against the app. Fixed in G6: the run ends as error, no bug |
| Open a run or suite run link that does not exist | Browser | Works: message and back to the project |
| Filters with unknown values, negative pages, huge page sizes | Probe | Refused or clamped |

## Bugs

| Story | How tested | Result |
|---|---|---|
| Change a bug's status; invalid status | Probe, Suite | Works; invalid refused |
| Assign a bug to a person who does not exist | Probe | Refused with "Bug not found". Fixed in G6: 400 "No such person" |
| File a bug by hand; open a bug on its own | Code | Was a gap. Built in G5: a bug panel and "File a bug" |

## Recordings

| Story | How tested | Result |
|---|---|---|
| Choose Firefox or WebKit for a recording | Code, Probe | **Was broken**: the recorder always used Chromium and replay then failed in production (Chromium only). Fixed in DD-3 |
| Open a recording link that does not exist | Browser | **Was broken**: an empty page. Fixed in DD-4 |
| Stop, reload, reconnect, leave without Stop, Stop after an API restart | Suite (integration) | Fixed in CR-1 |
| Replay a recording with no actions | Probe | Refused with a message |
| Delete a recording | Probe, Code | Was a gap. Built in G3 |

## The API as a whole

| Story | How tested | Result |
|---|---|---|
| A body that is not JSON, a body over 10 MB, a call from another website | Probe | **Was** a 500 "unexpected error". Fixed in DD-1 (400, 413, 403) |
| No token, a forged token | Probe | 401 |
| Each signed-in call checks the sign-in once | Suite | Fixed in CR-2 |

## Not tested here

- Real email delivery in production (needs the Supabase Auth URL settings to allow `/reset-password`, see DD-5).
- A run page left open for over an hour: the live connection keeps its first sign-in token, so a reconnect after
  the token expires may be refused. Read in the code, not reproduced.
- Real Slack delivery (F10, owner).
