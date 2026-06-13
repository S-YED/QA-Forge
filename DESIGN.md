# Design System — QA Forge

> Source of truth for QA Forge's visual language. Read this before any UI work.
> The system already lives in `apps/web/app/globals.css` (tokens) and
> `apps/web/tailwind.config.ts` (mappings); this file is the *why* and the rules.
> Created by `/design-consultation` (2026-06-12) by codifying the existing system
> and sharpening four things — see the Decisions Log.

## Product Context
- **What this is:** AI-powered QA platform — describe tests in plain English, AI generates them, Playwright executes them live with a streaming terminal, screenshot filmstrip, and auto-filed bugs.
- **Who it's for:** Developers and QA engineers; right now, hiring managers evaluating a public read-only demo.
- **Space/industry:** Developer tools / test automation (peers: Playwright, Cypress, BrowserStack, QA Wolf, Reflect).
- **Project type:** Web app (dashboard) + marketing/landing + an auto-sign-in demo.
- **The memorable thing:** "AI that runs the tests, live." Every decision serves the violet-glow streaming terminal as the hero moment.

## Aesthetic Direction
- **Direction:** Premium dark developer tool. Near-black canvas, violet/indigo treated as *light* (glow), glass surfaces, restraint everywhere else.
- **Decoration level:** Intentional — glassmorphism, soft violet glows, gradient text on brand moments only. Not bare, not expressive.
- **Mood:** Serious software with a modern hand. Calm, dark, focused; the color shows up where the product comes alive (a running test).
- **Reference points:** Linear (dark restraint), Vercel (developer polish), a terminal UI (the hero).

## Typography
Loaded via `next/font` in `app/layout.tsx` (variables set on `<html>`). Do **not** re-import via CSS `@import`.
- **Display / headings (`h1–h6`):** Plus Jakarta Sans — weight 700, letter-spacing `-0.02em`. Var `--font-jakarta`. Geometric, confident, not overused.
- **Body / UI:** Inter — var `--font-inter`. Workhorse; acceptable for body (only avoid as a *display* face).
- **Code / terminal / data / step timings:** **JetBrains Mono** — var `--font-mono`, Tailwind `font-mono`. This is brand: the live terminal is the hero surface, so its monospace is pinned, never a system fallback.
- **Loading:** `next/font/google` (self-hosted at build, no FOUT, no extra network hop).
- **Scale (rem):** xs `0.75` · sm `0.875` · base `1` · lg `1.125` · xl `1.25` · 2xl `1.5` · 3xl `1.875` · 4xl `2.25`. Headings tighten tracking to `-0.02em`.

## Color
HSL custom properties in `globals.css`; dark is the default theme, `.light` class for light mode.
- **Approach:** Restrained — one accent family (violet/indigo) + neutrals; semantic colors carry test state.
- **Brand violet (primary):** `#7C3AED` (`262 83% 58%`) — primary actions, focus ring, brand.
- **Brand indigo (secondary):** `#6366F1` (`239 84% 67%`) — gradient partner, secondary glow.
- **Violet light:** `#C084FC` (`262 100% 70%`) — gradient-text highlight.
- **Neutrals (dark):** canvas `#07070D` (`240 10% 4%`) · surface/card `#0F0F17` (`240 9% 7%`) · border/muted `#1C1C24` (`240 5% 12%`). Foreground `210 40% 98%`; muted text `215 16% 55%` (AA-compliant on canvas and card).
- **Semantic:** pass/success `#10B981` · fail/error `#EF4444` (`--destructive` `0 84% 60%`) · warning `#F59E0B` · info/running `#3B82F6`. These map to test/step statuses (passed/failed/running/skipped).
- **Dark mode:** is the default. Light mode redesigns surfaces (not just inverted) and keeps the same `#7C3AED` primary.

## Spacing
- **Base unit:** 4px (Tailwind default scale).
- **Density:** Comfortable.
- **Scale (px):** 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.

## Layout
- **Approach:** Hybrid — grid-disciplined in the app (sidebar + content; run-detail is a `55% / 1fr` two-column of steps + terminal), creative/asymmetric for landing + demo hero.
- **Max content width:** container-bounded; app content fills the panel.
- **Border radius:** `--radius: 0.75rem` (12px). Tailwind `lg` = radius, `md` = radius−2px, `sm` = radius−4px; `full` = 9999px for pills/badges/avatars.
- **Surfaces:** `.glass-card` (blur 16px) for cards, `.glass-sidebar` (blur 20px) for nav.

## Motion
- **Approach:** Intentional — entrance + meaningful state transitions, not decoration.
- **Signature easing:** `cubic-bezier(0.16, 1, 0.3, 1)` (`.transition-premium`, `.animate-fade-in-up`); `cubic-bezier(0.23, 1, 0.32, 1)` for `.ease-out-quint`.
- **Duration:** micro 50–100ms · short 150–250ms · medium 250–400ms · long 400–700ms.
- **Named effects:** `float`, `pulse-glow`, `shimmer`, `spin-slow`, `fade-in-up`, plus glows (`.glow-violet`, `.glow-indigo`).
- **Accessibility:** all animation/transition is collapsed to near-instant under `prefers-reduced-motion: reduce` (guard in `globals.css`). Keep it that way.

## Rules (the discipline that keeps violet from reading as "AI slop")
1. **Gradient is a special-occasion material, not a default.** Use the violet→indigo gradient ONLY for: the single landing hero CTA, `.gradient-text` brand wordmarks, and glow/border accents. **Primary buttons elsewhere are solid `violet-600`** (`hover:violet-500`). Utility CTAs (Export, error-recovery, form submits) are solid.
2. **Violet is light, on near-black.** The accent earns its place by being rare. Don't tint large surfaces violet; use it for state, focus, glow, and one CTA per view.
3. **Monospace everywhere code/output/timing appears.** `font-mono` (JetBrains Mono) for the terminal, step durations, selectors, exported code, IDs.
4. **Semantic colors own test state.** Green = passed, red = failed, blue = running, gray = skipped/pending. Don't use brand violet to signal status.
5. **Respect reduced motion.** Never ship an animation that ignores the `prefers-reduced-motion` guard.
6. **One accent.** No second decorative color family. Neutrals + violet/indigo + semantics only.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-12 | Initial DESIGN.md created by codifying the existing `globals.css`/`tailwind.config.ts` system | Existing system was coherent but undocumented; made it the source of truth before public launch |
| 2026-06-12 | Added JetBrains Mono as `--font-mono` / Tailwind `font-mono` | Terminal is the hero; it was falling back to inconsistent system mono |
| 2026-06-12 | Removed duplicate Google-Fonts `@import` from globals.css | Fonts already loaded via `next/font`; the `@import` double-fetched and risked FOUT |
| 2026-06-12 | Disciplined the gradient: solid `violet-600` primary buttons, gradient reserved for hero/brand | Gradient-fill-everywhere is the one AI-slop pattern the UI was in; applied to run-detail Export + demo error CTA |
| 2026-06-12 | Added `prefers-reduced-motion` guard | Animations were unguarded; accessibility gap |

### Follow-ups (documented, not yet applied)
- Audit remaining gradient-fill CTAs (login, register, landing secondary buttons) against Rule 1 — keep gradient only on the landing hero CTA.
- Verify `muted-foreground` (`215 16% 47%`) and the demo-banner violet text meet WCAG AA for small text on the dark canvas; nudge lightness if not.
