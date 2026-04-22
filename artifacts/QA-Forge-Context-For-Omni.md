# QA Forge Project Context

This document contains architectural details, technical stack choices, structure, and current running logs for the QA Forge project. This context is intended to help a multi-modal AI (like Qwen Omni) analyze videos, screenshots, and error logs to quickly pinpoint the root cause of issues in the codebase.

## 1. Project Architecture Overview

QA Forge is a Monorepo structured with `turborepo` and `pnpm`. It features a full-stack architecture separated into distinct apps and packages.

### Technologies & Frameworks
- **Frontend (`apps/web`)**: Next.js 14, React 18, Tailwind CSS, `@supabase/ssr` (for auth and data fetching), and `@supabase/auth-ui-react`. Runs on port `3000`.
- **Backend API (`apps/api`)**: Node.js/Express with TypeScript. Uses `cors`, `zod` for validation, `express-rate-limit`, `winston` for logging, and `socket.io` for real-time capabilities. Connects to Supabase. Runs on port `4000`.
- **Shared Package (`packages/shared-types`)**: Contains shared Zod schemas and TypeScript interfaces used by both the frontend and backend.
- **Database & Auth (`supabase`)**: Local dockerized Supabase instance containing PostgreSQL (with `pgvector` extension for AI Context mapping), Supabase Auth, Storage, and Edge Functions. Includes 17 migration schemas defining tables like `profiles`, `projects`, `test_cases`, `test_runs`, `app_contexts` and more. 

### Network Diagram (Local Dev)
- **Web App (Next.js)** -> `http://localhost:3000`
- **REST API (Express)** -> `http://localhost:4000` (Returns `{ error: { code: 'NOT_FOUND' } }` if you hit the root `/` route directly, expects `/api/*`)
- **Supabase Local API** -> `http://localhost:54321`
- **Supabase Studio (DB UI)** -> `http://localhost:54323`

---

## 2. Directory Structure

- **`apps/web/`**: Next.js App router application. Includes `middleware.ts` for route protection and Supabase cookie management.
- **`apps/api/`**: Express application. Entry point is `src/index.ts`. Includes routes under `src/routes/` and middleware for Auth/Error handling.
- **`packages/shared-types/`**: Contains shared DTOs and type definitions. Note: this package must be built for the monorepo to resolve imports securely (e.g. `pnpm --filter @qaforge/shared-types build`).
- **`supabase/migrations/`**: PostgreSQL schema migrations defining tables and Row-Level Security (RLS) policies.
- **`artifacts/`**: Contains Epic briefs, Deployment guides, Setup markdown, and AI system contexts.

---

## 3. Current Running Status & Logs

The developer is currently running the local environment via the `pnpm run dev` script at the project root resulting in `Apps/api` starting via `tsx` and `Apps/web` starting via `next dev`.

**Recent CLI Activity (from Turborepo `pnpm dev`):**
```text
@qaforge/api:dev: info:  🔌 Socket.io server attached                                                        
@qaforge/api:dev: info:  🚀 QAForge API running on http://localhost:4000   
@qaforge/web:dev:  ✓ Ready in 2.9s
@qaforge/web:dev:  ○ Compiling /login ...
@qaforge/web:dev:  GET /login 200 in 7459ms
```

**Known Quirks to check for:**
1. **Hitting Port 4000 Directly**: Navigating to `http://localhost:4000` in the browser returns a `NOT_FOUND` JSON error. This is intended, as it is the Express API, not the Next.js frontend (which is on `3000`).
2. **Next.js Supabase Middleware**: Stale auth cookies have historically caused issues within Next.js if `middleware.ts` drops refreshed tokens.
3. **Monorepo Imports**: TS/Build errors often occur if the API/Web cannot resolve `@qaforge/shared-types` (usually solved by building the workspace explicitly in Next.js or via tsc).

---

## Please use the above information combined with the provided video/screenshots to explicitly diagnose the error(s) occurring in the QA Forge Application.
