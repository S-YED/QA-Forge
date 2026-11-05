# QA Forge: Project Overview

**What it is:** an AI-assisted browser testing platform. Describe what to test, get structured test cases,
run them in a real Playwright browser, watch progress live, and inspect screenshots, results and auto-filed bugs.

**Users:** developers and QA engineers who want test coverage without hand-writing every case, and who need
evidence (screenshots, step logs, bug reports) when something fails.

## Two workflows, one schema, one engine
- **Manual:** project → suite → write cases with structured steps → choose browser → run → review.
- **AI-assisted:** project → configure a provider key (or local demo mode) → describe a feature → review, edit and
  approve generated cases → save to a suite → run → review.
Both produce the same `test_cases.steps` shape and execute through the same runner.

## Feature status (5 Nov 2026; details in [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md))
| Feature | Status |
|---|---|
| Email auth, `/demo` read-only account | Works |
| Projects / suites / cases CRUD (API) | Works; UI lacks per-case edit/delete and a structured step editor |
| AI generation (OpenAI, Anthropic, Gemini, OpenRouter) | Works with a user key; auto-saves with no review; output not validated |
| Playwright execution + live socket stream | Works on the happy path; false positives and races (see audit) |
| Screenshots, auto-bugs | Work; screenshots are public |
| Local demo AI provider, demo target app, one-command setup, E2E tests | Missing |
| Recording/replay, exports, Jira/GitHub/Slack integrations, vector context | Deferred past December |

## December 2026 objective
A developer who has never seen the repo can clone, run one setup command, sign in, create a project against the
bundled demo app, generate (or write) cases, execute them in a real browser, watch live, and inspect evidence,
with no help from the author. Bar: [STRANGER_RUN.md](STRANGER_RUN.md). Plan: [DECEMBER_2026_ROADMAP.md](DECEMBER_2026_ROADMAP.md).
