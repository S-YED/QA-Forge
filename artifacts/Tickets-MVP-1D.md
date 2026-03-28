# QAForge — Implementation Tickets: MVP-1D

Frontend Baseline & Auth Pipeline (Next.js)

---

### TICKET-1D-01: Install Supabase SSR Packages

**Status:** Done

**Description:** Add the correct Supabase packages for Next.js App Router cookie-based session management. The deprecated `@supabase/auth-helpers-nextjs` must not be used.

**Packages Added to `apps/web/package.json`:**

| Package | Version | Purpose |
|---|---|---|
| `@supabase/ssr` | `^0.5.0` | App Router cookie-based session management (`createBrowserClient`, `createServerClient`) |
| `@supabase/supabase-js` | `^2.45.0` | Core Supabase client |
| `@supabase/auth-ui-react` | `^0.4.7` | Pre-built `<Auth>` component for the login page |
| `@supabase/auth-ui-shared` | `^0.1.8` | `ThemeSupa` theme for the Auth UI component |

**Key Decision:** `@supabase/ssr` is the current recommended package for Next.js App Router. It provides `createBrowserClient` (for Client Components) and `createServerClient` (for Server Components and middleware) with proper cookie handling.

---

### TICKET-1D-02: Supabase Browser Client (lib/supabase/client.ts)

**Status:** Done

**File:** `apps/web/lib/supabase/client.ts`

**Description:** Create the browser-side Supabase client for use in Client Components.

**Key Implementation Details:**
- `'use client'` directive — this module is only safe to import in Client Components
- `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)` — uses the anon key (safe for browser)
- Exported as `createClient()` factory function — called fresh in each component to avoid stale state
- Used by: `lib/api/client.ts` (for JWT), `components/layout/sidebar.tsx` (for sign-out), `app/(auth)/login/page.tsx` (for Auth UI)

---

### TICKET-1D-03: Supabase Server Client (lib/supabase/server.ts)

**Status:** Done

**File:** `apps/web/lib/supabase/server.ts`

**Description:** Create the server-side Supabase client for use in Server Components and Route Handlers.

**Key Implementation Details:**
- `createServerClient(URL, ANON_KEY, { cookies: { getAll(), setAll() } })` from `@supabase/ssr`
- `getAll()` — reads from `cookies()` (Next.js `next/headers`)
- `setAll()` — writes to `cookies()` inside a try/catch; the catch is intentional — `setAll` may be called from a Server Component where cookie mutation is not allowed, but the middleware handles session refresh
- Exported as `createServerSupabaseClient()` factory — called fresh in each Server Component
- Used by: `app/(dashboard)/layout.tsx`, `app/(dashboard)/dashboard/projects/page.tsx`, `app/(dashboard)/dashboard/settings/ai-keys/page.tsx`, `app/(dashboard)/dashboard/settings/profile/page.tsx`

---

### TICKET-1D-04: Supabase Middleware Client (lib/supabase/middleware.ts)

**Status:** Done

**File:** `apps/web/lib/supabase/middleware.ts`

**Description:** Create the Supabase client specifically for use in Next.js middleware, with proper cookie refresh handling.

**Key Implementation Details:**
- `createMiddlewareClient(request: NextRequest)` — creates a `createServerClient` that reads cookies from `request.cookies` and writes to a `NextResponse`
- **Getter pattern:** `return { supabase, get response() { return supabaseResponse; } }` — the `get response()` getter ensures callers always read the **latest** `supabaseResponse`, even after `setAll()` reassigns it during a token refresh
- `setAll()` implementation: updates `request.cookies`, creates a new `NextResponse.next({ request })`, then sets cookies on the new response — this is the pattern required by `@supabase/ssr` for middleware
- Used exclusively by `apps/web/middleware.ts`

---

### TICKET-1D-05: Root Middleware Route Protection (middleware.ts)

**Status:** Done

**File:** `apps/web/middleware.ts`

**Description:** Implement server-side route protection that enforces authentication before any page renders.

**Key Implementation Details:**
- `createMiddlewareClient(request)` — creates the middleware Supabase client
- `supabase.auth.getUser()` — **must be called** to refresh the session cookie; do not use `getSession()` in middleware (it doesn't refresh)
- Reads `response` via getter **after** `getUser()` — ensures the post-refresh response is used
- **Unauthenticated + `/dashboard/*`** → `NextResponse.redirect('/login')` + copies refreshed cookies to redirect response
- **Authenticated + `/login`** → `NextResponse.redirect('/dashboard/projects')` + copies refreshed cookies
- **Otherwise** → returns `response` (the refreshed response with updated cookies)
- `matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']` — runs on all routes except static assets

---

### TICKET-1D-06: Typed API Fetch Client (lib/api/client.ts)

**Status:** Done

**File:** `apps/web/lib/api/client.ts`

**Description:** Implement a thin typed fetch wrapper that attaches Supabase JWTs to all API requests and handles common error cases.

**Key Implementation Details:**
- `BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'`
- `getAuthHeaders()` — calls `createClient().auth.getSession()`; attaches `Authorization: Bearer <access_token>` if session exists; always includes `Content-Type: application/json`
- `handleResponse<T>(response)`:
  - 401 → signs out via `supabase.auth.signOut()` + `window.location.href = '/login'`
  - Non-OK → parses error body JSON, throws with `errorBody.message`
  - 204 → returns `undefined as unknown as T`
  - OK → returns `response.json() as Promise<T>`
- `apiClient.get<T>`, `apiClient.post<T>`, `apiClient.put<T>`, `apiClient.del<T>` — all call `getAuthHeaders()` and `handleResponse<T>`
- **No `axios`, no `@tanstack/react-query`** — native `fetch` only

---

### TICKET-1D-07: Auth Layout (app/(auth)/layout.tsx)

**Status:** Done

**File:** `apps/web/app/(auth)/layout.tsx`

**Description:** Create the centered layout for authentication pages.

**Key Implementation Details:**
- Server Component (no `'use client'` directive)
- `flex min-h-screen items-center justify-center bg-background` — full-screen centered layout
- `w-full max-w-md px-4` — constrains content width for the login form
- Wraps `app/(auth)/login/page.tsx`

---

### TICKET-1D-08: Login Page with Auth UI (app/(auth)/login/page.tsx)

**Status:** Done

**File:** `apps/web/app/(auth)/login/page.tsx`

**Description:** Implement the login page using the Supabase Auth UI component.

**Key Implementation Details:**
- `'use client'` — required for `useEffect`, `useRouter`, and the Auth UI component
- `supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN') router.push('/dashboard/projects') })` — listens for successful auth and redirects; subscription cleaned up in `useEffect` return
- `<Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand, brandAccent, brandButtonText } } } }} providers={[]} view="sign_in" showLinks={true} redirectTo={...} />`
- `providers={[]}` — email + password only; no OAuth providers in MVP
- `showLinks={true}` — shows "Don't have an account? Sign up" link
- Brand colors match the shadcn/ui theme: `hsl(222.2 47.4% 11.2%)` (primary), `hsl(210 40% 96.1%)` (accent)

---

### TICKET-1D-09: Dashboard Layout + Sidebar

**Status:** Done

**Files:**
- `apps/web/app/(dashboard)/layout.tsx`
- `apps/web/components/layout/sidebar.tsx`

**Description:** Implement the fixed left-sidebar dashboard layout with navigation and sign-out.

**Key Implementation Details — Layout:**
- Server Component; calls `createServerSupabaseClient().auth.getUser()`; `redirect('/login')` if no user (defense-in-depth beyond middleware)
- `flex min-h-screen` — sidebar + main content side by side
- `<Sidebar />` + `<main className="flex-1 overflow-auto bg-background"><div className="container mx-auto p-6 lg:p-8">{children}</div></main>`

**Key Implementation Details — Sidebar:**
- `'use client'` — required for `usePathname`, `useRouter`, and sign-out handler
- Fixed `w-64` width, `h-screen`, `border-r bg-card`
- **Logo:** `QF` in a rounded primary-colored box + "QAForge" text
- **Nav items:** Projects (`/dashboard/projects`), AI Keys (`/dashboard/settings/ai-keys`), Profile (`/dashboard/settings/profile`), Integrations (`/dashboard/settings/integrations`) — each with an inline SVG icon
- **Active state:** `pathname === item.href || pathname.startsWith(item.href + '/')` — `bg-primary text-primary-foreground` when active
- **Sign Out:** `supabase.auth.signOut()` + `router.push('/login')`

---

### TICKET-1D-10: Projects Page — Server Component

**Status:** Done

**File:** `apps/web/app/(dashboard)/dashboard/projects/page.tsx`

**Description:** Implement the Projects page as a Server Component that fetches initial data server-side.

**Key Implementation Details:**
- Server Component; calls `createServerSupabaseClient().auth.getSession()` to get `access_token`
- `getProjects(accessToken)` — `fetch(${baseUrl}/api/projects, { headers: { Authorization: Bearer ${token} }, cache: 'no-store' })`; returns `[]` on non-OK response
- Passes `initialProjects` to `<ProjectsGrid>` — no client-side loading state for initial render
- **API endpoint consumed:** `GET /api/projects`

---

### TICKET-1D-11: Projects Grid + Empty State

**Status:** Done

**File:** `apps/web/components/projects/projects-grid.tsx`

**Description:** Implement the projects card grid with empty state and refresh-on-create behavior.

**Key Implementation Details:**
- `'use client'`; `useState<Project[]>(initialProjects)` — hydrates from server-fetched data
- **Empty state:** dashed border, folder icon, "No projects yet" heading, "Create Project" CTA button
- **Card grid:** `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`; each card shows `name`, `description` (line-clamp-2), `base_url` (monospace, truncated), `created_at` (formatted)
- Card click → `router.push('/dashboard/projects/${project.id}')`
- `refreshProjects()` — `apiClient.get<ProjectsResponse>('/api/projects')` → updates state
- `handleProjectCreated()` — closes modal + calls `refreshProjects()`
- **API endpoints consumed:** `GET /api/projects`

---

### TICKET-1D-12: Create Project Modal

**Status:** Done

**File:** `apps/web/components/projects/create-project-modal.tsx`

**Description:** Implement the project creation modal with form validation and API integration.

**Key Implementation Details:**
- `'use client'`; returns `null` when `!open` — no DOM when closed
- Fixed overlay: `fixed inset-0 z-50 flex items-center justify-center`; backdrop with `bg-black/50 backdrop-blur-sm`
- Form fields: `name` (required, text), `description` (optional, textarea, 3 rows), `base_url` (optional, type="url")
- `handleSubmit()` — builds `CreateProjectRequest` body (omits empty optional fields); calls `apiClient.post('/api/projects', body)`; calls `onCreated()` on success
- Error display: `bg-destructive/10 text-destructive` banner
- Submit button disabled when `loading || !name.trim()`
- **API endpoint consumed:** `POST /api/projects`

---

### TICKET-1D-13: Project Detail Stub

**Status:** Done

**File:** `apps/web/app/(dashboard)/dashboard/projects/[id]/page.tsx`

**Description:** Create a placeholder page for the project detail view. Full implementation is deferred to MVP-2.

**Key Implementation Details:**
- Server Component (no `'use client'`)
- Displays `params.id` for debugging
- "Coming in MVP-2" message with a diamond/gem SVG icon
- Describes what will be available: test runs, recorded sessions, AI-powered test generation

---

### TICKET-1D-14: AI Keys Page — Server Component

**Status:** Done

**File:** `apps/web/app/(dashboard)/dashboard/settings/ai-keys/page.tsx`

**Description:** Implement the AI Keys settings page as a Server Component that fetches initial key data server-side.

**Key Implementation Details:**
- Server Component; calls `createServerSupabaseClient().auth.getSession()` to get `access_token`
- `getApiKeys(accessToken)` — `fetch(${baseUrl}/api/api-keys, { headers: { Authorization: Bearer ${token} }, cache: 'no-store' })`; returns `[]` on non-OK
- Passes `initialKeys: ApiKeyResponse[]` to `<AiKeysManager>` — `ApiKeyResponse` type omits `encrypted_key`
- **API endpoint consumed:** `GET /api/api-keys`

---

### TICKET-1D-15: AI Keys Manager Component

**Status:** Done

**File:** `apps/web/components/settings/ai-keys-manager.tsx`

**Description:** Implement the AI keys management table with validate and delete actions.

**Key Implementation Details:**
- `'use client'`; `useState<ApiKeyResponse[]>(initialKeys)`
- **Empty state:** key icon, "No API keys configured" heading, "Add API Key" CTA
- **Table columns:** Provider (human-readable label), Key Hint (`••••{key_hint}`), Status badge (green "Valid" / yellow "Unverified"), Actions
- `handleValidate(id)` — `apiClient.post('/api/api-keys/${id}/validate')`; `validatingId` state shows "Validating..." during request
- `handleDelete(id)` — `apiClient.del('/api/api-keys/${id}')`; `deletingId` state shows "Deleting..." during request
- Both actions call `refreshProjects()` after completion
- `providerLabel()` — maps `'openai'` → `'OpenAI'`, `'anthropic'` → `'Anthropic'`, `'gemini'` → `'Gemini'`
- **API endpoints consumed:** `GET /api/api-keys`, `POST /api/api-keys/:id/validate`, `DELETE /api/api-keys/:id`

---

### TICKET-1D-16: Add API Key Modal

**Status:** Done

**File:** `apps/web/components/settings/add-api-key-modal.tsx`

**Description:** Implement the modal for adding a new AI provider API key.

**Key Implementation Details:**
- `'use client'`; returns `null` when `!open`
- Imports `ApiKeyProvider` enum from `@qaforge/shared-types` — provider values are type-safe
- Provider `<select>`: options from `providers` array using `ApiKeyProvider.OPENAI/ANTHROPIC/GEMINI` values
- Key `<input type="password">` — masked input; placeholder `sk-...`
- `handleSubmit()` — builds `CreateApiKeyRequest = { provider, key }`; calls `apiClient.post('/api/api-keys', body)`; calls `onAdded()` on success
- Submit button disabled when `loading || !key.trim()`
- **API endpoint consumed:** `POST /api/api-keys`

---

### TICKET-1D-17: Profile Page — Server Component

**Status:** Done

**File:** `apps/web/app/(dashboard)/dashboard/settings/profile/page.tsx`

**Description:** Implement the Profile settings page as a Server Component that fetches the user's profile server-side.

**Key Implementation Details:**
- Server Component; calls `createServerSupabaseClient().auth.getSession()` to get `access_token`
- `getProfile(accessToken)` — `fetch(${baseUrl}/api/auth/me, { headers: { Authorization: Bearer ${token} }, cache: 'no-store' })`; returns `null` on non-OK
- Renders `<ProfileForm profile={profile} />` if profile loaded; fallback error message if `null`
- **API endpoint consumed:** `GET /api/auth/me`

---

### TICKET-1D-18: Profile Form Component

**Status:** Done

**File:** `apps/web/components/settings/profile-form.tsx`

**Description:** Implement the profile editing form with success/error feedback.

**Key Implementation Details:**
- `'use client'`; `useState` for `fullName`, `avatarUrl`, `loading`, `feedback`
- **Email field:** `disabled` + `bg-muted text-muted-foreground cursor-not-allowed` — read-only; "Email cannot be changed" hint text
- **Full Name field:** editable text input
- **Avatar URL field:** editable URL input
- **Role field:** read-only display div (not an input) — shows `profile.role`
- `handleSubmit()` — `apiClient.put('/api/auth/me', { full_name: fullName || undefined, avatar_url: avatarUrl || undefined })`
- Feedback: green success banner or red error banner
- **API endpoint consumed:** `PUT /api/auth/me`

---

### TICKET-1D-19: Integrations Placeholder Page

**Status:** Done

**File:** `apps/web/app/(dashboard)/dashboard/settings/integrations/page.tsx`

**Description:** Create a placeholder page for the Integrations settings. Full implementation is deferred to a future release.

**Key Implementation Details:**
- Server Component (no `'use client'`)
- "Coming Soon" message with a plug/connector SVG icon
- Lists planned integrations: Jira, GitHub, Slack
- No API endpoints consumed

---

### TICKET-1D-20: Update .env.local Template

**Status:** Done

**File:** `apps/web/.env.local`

**Description:** Ensure the `.env.local` template file exists with the correct variable names and placeholder values.

**Key Implementation Details:**
- `NEXT_PUBLIC_SUPABASE_URL=` — empty; user must paste API URL from `supabase status`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=` — empty; user must paste anon key from `supabase status`
- `NEXT_PUBLIC_API_URL=http://localhost:4000` — pre-filled with the local Express API URL
- All three variables are `NEXT_PUBLIC_*` — exposed to the browser bundle; safe because the anon key is public and RLS enforces security
- File is committed to the repository as a template (unlike `apps/api/.env` which must be created from scratch)
