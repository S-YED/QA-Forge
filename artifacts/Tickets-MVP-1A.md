# QAForge — Implementation Tickets: MVP-1A

Monorepo Foundation & Tooling

---

### TICKET-1A-01: Initialize pnpm Workspace & Turborepo

**Status:** Done

**Description:** Create the root workspace configuration files that define the monorepo structure, build pipeline, and shared tooling.

**Files Created:**
- `pnpm-workspace.yaml` — declares `apps/*` and `packages/*` as workspace members
- `turbo.json` — Turborepo pipeline: `build` (dependsOn `^build`, outputs `dist/**` and `.next/**`), `dev` (persistent, cache: false), `lint` (dependsOn `^lint`), `type-check` (dependsOn `^type-check`)
- `package.json` — root scripts (`dev`, `build`, `lint`, `format`, `type-check`); devDependencies: `turbo ^2.3.0`, `typescript ^5.7.0`, `prettier ^3.4.0`, `eslint ^8.57.0`, `@typescript-eslint/eslint-plugin ^7.0.0`, `@typescript-eslint/parser ^7.0.0`
- `tsconfig.json` — root TypeScript config with path aliases
- `.eslintrc.cjs` — ESLint config (CJS format required for ESLint config files even in ESM projects)
- `.prettierrc` — Prettier config
- `.gitignore` — ignores `node_modules`, `.next`, `dist`, `.env*`, `.turbo`
- `.env.example` — template documenting all required environment variables

**Acceptance Criteria:**
- `pnpm install` succeeds from root with zero errors
- `turbo build` runs without errors
- All workspace packages resolve correctly via `workspace:*` protocol

---

### TICKET-1A-02: Scaffold apps/web (Next.js)

**Status:** Done

**Description:** Initialize the Next.js 14 App Router application with Tailwind CSS, shadcn/ui configuration, TypeScript, and the `@qaforge/shared-types` workspace dependency.

**Files Created:**
- `apps/web/package.json` — name: `@qaforge/web`; dependencies: `next ^14.2.0`, `react ^18.3.0`, `react-dom ^18.3.0`, `@qaforge/shared-types: workspace:*`, `clsx ^2.1.0`, `tailwind-merge ^2.6.0`; devDependencies: `typescript ^5.7.0`, `@types/react ^18.3.0`, `tailwindcss ^3.4.0`, `postcss ^8.4.0`, `autoprefixer ^10.4.0`
- `apps/web/next.config.js` — Next.js config
- `apps/web/tsconfig.json` — TypeScript config with `@/*` path alias pointing to the app root
- `apps/web/tailwind.config.ts` — Tailwind config with content paths for `app/**` and `components/**`
- `apps/web/postcss.config.js` — PostCSS config with Tailwind and Autoprefixer
- `apps/web/components.json` — shadcn/ui config
- `apps/web/app/layout.tsx` — root layout with `<html>` and `<body>` tags, Tailwind base styles
- `apps/web/app/page.tsx` — placeholder homepage
- `apps/web/app/globals.css` — Tailwind directives (`@tailwind base/components/utilities`) + CSS custom properties for shadcn/ui theming
- `apps/web/lib/utils.ts` — `cn()` utility combining `clsx` and `tailwind-merge`
- `apps/web/.env.local` — template with empty Supabase values and `NEXT_PUBLIC_API_URL=http://localhost:4000`

---

### TICKET-1A-03: Scaffold apps/api (Express)

**Status:** Done

**Description:** Initialize the Express + TypeScript API with `tsx` for development hot-reload and all production dependencies declared.

**Files Created:**
- `apps/api/package.json` — name: `@qaforge/api`; scripts: `dev: tsx watch src/index.ts`, `build: tsc`, `start: node dist/index.js`; dependencies: `@qaforge/shared-types: workspace:*`, `@supabase/supabase-js ^2.47.0`, `cors ^2.8.5`, `dotenv ^16.4.0`, `express ^4.21.0`, `express-rate-limit ^7.5.0`, `socket.io ^4.8.0`, `winston ^3.17.0`, `zod ^3.23.0`; devDependencies: `@types/cors`, `@types/express ^5.0.0`, `@types/node ^22.0.0`, `tsx ^4.19.0`, `typescript ^5.7.0`
- `apps/api/tsconfig.json` — TypeScript config targeting ESNext modules, `outDir: dist`, `rootDir: src`

---

### TICKET-1A-04: Scaffold packages/shared-types

**Status:** Done

**Description:** Create the shared-types package as the single source of truth for all TypeScript types shared between the frontend and backend. Both `apps/web` and `apps/api` depend on this package via `workspace:*`.

**Files Created:**
- `packages/shared-types/package.json` — name: `@qaforge/shared-types`; `"type": "module"`; `"main": "./dist/index.js"`; `"types": "./dist/index.d.ts"`; exports map: `"."` → `{ "import": "./dist/index.js", "types": "./dist/index.d.ts" }`; scripts: `build: tsc`, `type-check: tsc --noEmit`, `lint: eslint src`
- `packages/shared-types/tsconfig.json` — TypeScript config
- `packages/shared-types/src/index.ts` — barrel export re-exporting from `database.ts`, `enums.ts`, `api.ts`, `websocket.ts`

**Key Decision:** The package compiles TypeScript to JavaScript via `tsc` and publishes `dist/` artifacts. Workspace consumers resolve `@qaforge/shared-types` through the `exports` map pointing to `./dist/index.js` and `./dist/index.d.ts`. Running `turbo build` (or `pnpm --filter @qaforge/shared-types build`) must precede API/Web builds so that the compiled output is available.

---

### TICKET-1A-05: Scaffold packages/ai-engine, playwright-runner, export-engine, integrations

**Status:** Done

**Description:** Create stub packages for future phases. Each package has the minimum required files to be a valid pnpm workspace member and TypeScript project. The `src/index.ts` in each contains a `TODO` comment indicating the phase in which it will be implemented.

**Files Created (per package):**
- `packages/ai-engine/package.json` — name: `@qaforge/ai-engine`
- `packages/ai-engine/tsconfig.json`
- `packages/ai-engine/src/index.ts` — `// TODO: MVP-2 — AI test generation engine`
- `packages/playwright-runner/package.json` — name: `@qaforge/playwright-runner`
- `packages/playwright-runner/tsconfig.json`
- `packages/playwright-runner/src/index.ts` — `// TODO: MVP-2 — Playwright test execution runner`
- `packages/export-engine/package.json` — name: `@qaforge/export-engine`
- `packages/export-engine/tsconfig.json`
- `packages/export-engine/src/index.ts` — `// TODO: MVP-3 — Test report export engine`
- `packages/integrations/package.json` — name: `@qaforge/integrations`
- `packages/integrations/tsconfig.json`
- `packages/integrations/src/index.ts` — `// TODO: MVP-3 — Third-party integrations (Jira, GitHub, Slack)`
