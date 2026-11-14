# December 2026 Roadmap

Deadline **31 Dec 2026**. Ticket details and acceptance criteria: [artifacts/DECEMBER_2026_EXECUTION_PLAN.md](../artifacts/DECEMBER_2026_EXECUTION_PLAN.md).
Critical path: **CON-1 → RUN-1 → EXE-1 → UI-1 → QA-3**. DEMO-1 should land by Phase 2 so runner tests have a target.

| Phase | Dates | Tickets | Deliverable |
|---|---|---|---|
| 0 Discovery & baseline | 5–8 Nov | B-0 ✅, SEC-1 ✅, SEC-2 ✅, DOC-1 | Verified baseline, audit, backlog, prod security hotfix ready |
| 1 Foundation | 9–15 Nov | CON-1, CON-2, DX-1, CI lint | One step contract with `action` enum; correct env templates |
| 2 Browser execution | 16–22 Nov | DEMO-1, RUN-1, EXE-1, EXE-2, EXE-3, QA-1 | No false positives, atomic claims, recovery, private evidence |
| 3 AI & monitoring | 23–29 Nov | UI-1, AI-1, AI-2, AI-3, UI-2 | Review-before-save AI flow, local demo provider, live recovery UI |
| 4 Quality & security | 30 Nov–6 Dec | SEC-3, QA-2, S6 fixes | SSRF guard, cross-user RLS/API matrix |
| 5 Independent usability | 7–13 Dec | DX-2, QA-3, CI-1, README rewrite | `pnpm bootstrap` on a clean clone; E2E in CI |
| 6 Release candidate | 14–20 Dec | Clean-clone installs (Windows + Linux), fix-forward | RC tag |
| 7 Hardening | 21–27 Dec | Regression, security re-verify, docs review, backup/restore check | Release-ready build |
| 8 Release | 28–31 Dec | Final E2E, tag, release notes, known limitations | v1.0 December release |

**Scope lock:** recording/replay, export-engine, Jira/GitHub/Slack integrations, vector app context, sprint impact,
visual regression, team RBAC, and distributed workers are **deferred**. Single-API-instance execution is the
supported December topology (documented in ARCHITECTURE.md).

**Risks:** (1) prod Supabase still has the S1 hole until migration 22 is applied (needs owner approval);
(2) Windows + Docker variance for the clean-clone test; (3) free-tier LLM rate limits, mitigated by the local-demo
provider for CI and demos.
