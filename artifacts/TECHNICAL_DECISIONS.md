# Technical Decisions

## TD-1 (5 Nov 2026): Explicit `action` enum on every test step
**Decision (owner-approved):** steps become `{ step_number, action, instruction, selector?, value?, expected? }`,
with `action` ∈ navigate, click, fill, select, hover, press, wait_for, assert_visible, assert_text, assert_url,
scroll. `instruction` stays as the human-readable description. The runner dispatches only on `action`; unknown or
missing actions fail validation before the browser launches.
**Why:** the regex-on-free-text runner silently clicked on unrecognised text, so false passes were possible.
Assert variants can't be told apart from wording alone.
**Alternative rejected:** strict first-verb parsing of `instruction` (no schema change). Still ambiguous for
assertions, and it couples wording to behaviour.

## TD-2 (5 Nov 2026): Profile protection with column privileges, not policy rewrites
**Decision:** migration 22 revokes client INSERT/UPDATE/DELETE on `profiles` and grants UPDATE on `full_name`,
`avatar_url` only.
**Why:** RLS chooses rows, not columns. Supabase's default grants gave clients every column, including `role`.
Column grants are the native, smallest fix, and they leave service-role and SECURITY DEFINER paths untouched.
**Alternative rejected:** a BEFORE UPDATE trigger that rejects `role` changes. That's more code and is easy to
bypass by adding new sensitive columns later.

## TD-3 (5 Nov 2026): Single execution owner, atomic claim through a conditional UPDATE (planned, EXE-1)
**Decision:** HTTP `POST /test-runs` is the only start path. The executor claims with
`UPDATE … SET status='running' WHERE id=$1 AND status='pending' RETURNING *`. The socket is observe-only.
**Why:** a single Postgres statement is atomic, so no RPC, lock table or queue is needed.
**Alternative rejected for December:** BullMQ/Redis workers. Not needed for the single-instance topology, and it
adds infrastructure that a clean-clone user would have to run.

## TD-4 (5 Nov 2026): Integration tests run against real local Supabase, separate from unit tests
**Decision:** `*.int.test.ts` files run via `pnpm --filter @qaforge/api test:integration`
(`vitest.integration.config.ts`) and are excluded from `pnpm test`.
**Why:** RLS and grants can only be verified against real Postgres. Unit tests must stay runnable without Docker.

## TD-5 (5 Nov 2026): Setup command named `pnpm bootstrap` (planned, DX-2)
**Why:** `pnpm setup` is a pnpm built-in (it configures PNPM_HOME) and never runs a package script of that name.

## TD-6 (5 Nov 2026): Contract details for CON-1
- **Requirement table, not per-action schemas.** `STEP_ACTION_FIELDS` drives the Zod refinement, the editor's inputs and
  the AI prompt, so the three can't drift. A discriminated union would give stricter types but triple the code.
- **Blank strings count as missing.** Forms and LLMs send `""`; treating it as absent prevents "fill with nothing" passes.
  Consequence: a `fill` step can't type an empty string (clearing a field). Add an explicit `clear` action if needed.
- **AI output: drop invalid cases, don't fail the batch.** `generateTestCases` returns `rejected[]` with field paths; it
  throws only when nothing is valid. Bad `priority`/`type`/`tags` fall back to defaults instead of rejecting.
- **WebSocket payloads stay TypeScript-only.** They're server-emitted, so there's no untrusted input to validate.
  Revisit if clients ever send structured payloads.

## TD-7 (5 Nov 2026): Runner result semantics (RUN-1)
- **Three outcomes.** `failed` = the application under test didn't behave (an assertion or locator failed). `error` = the
  run couldn't be judged (invalid steps, browser launch, unreachable base URL, cancelled, persistence callback threw).
  Bugs are filed only for `failed`, so infra problems don't create product bugs.
- **Strict interactions, lenient assertions.** click/fill/select/hover/press use Playwright strict locators, so an ambiguous
  selector fails instead of acting on the wrong element. wait_for/assert_*/scroll use the first match.
- **No fixed sleeps.** Waits use Playwright auto-waiting with the context default timeout (15 s per step, 30 s navigation).
  `assert_text`/`assert_url` poll until the timeout.
- **http(s)-only navigation** is enforced in the runner now; private-network blocking is SEC-3.
