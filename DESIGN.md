# Design System — QA Forge ("Blueprint")

> Source of truth for QA Forge's visual language. Read this before any UI work.
> The system lives in `apps/web/app/globals.css` (OKLCH tokens),
> `apps/web/tailwind.config.ts` (token → utility mapping), `apps/web/components/ui/*`
> (shadcn/Radix primitives) and `apps/web/components/shared/*` (app patterns).
> This file is the *why* and the rules.

## Product Context
- **What this is:** AI-powered QA platform — describe tests in plain English, AI generates Playwright cases, they execute live with a streaming console, screenshot filmstrip, and auto-filed bugs.
- **Who it's for:** Developers and QA engineers; today, hiring managers evaluating a public read-only demo.
- **Space:** Developer tools / test automation (peers: Playwright, Cypress, BrowserStack, QA Wolf).
- **The memorable thing:** "AI that runs the tests, live." The dark execution **console** is the one hero surface; everything else is the calm, precise instrument around it.

## Aesthetic Direction — "Blueprint"
- **Direction:** A measurement instrument. Light, precise, high-legibility surfaces (white/cool canvas, near-black ink) with a single confident **mineral-teal** accent. The live test console is the one *lit* dark panel — so it reads as the hero, not as decoration.
- **Why this direction:** The prior system (near-black canvas + violet glow + glassmorphism + gradient text) was the most saturated "AI dev-tool" template of 2026 — it read as AI-slop. Blueprint deliberately escapes both that reflex *and* the second-order "light editorial serif" reflex. Adopted **2026-06-19** with explicit owner approval (supersedes the prior dark/violet system; see Decisions Log).
- **Decoration level:** Restraint by default. Color is rare and meaningful. No glow, no glass, no gradient fills, no decorative motion.
- **Reference points:** Linear/Vercel (light, precise dev tooling), an oscilloscope or lab readout (the console), an engineering datasheet (feature/spec layouts).

## Typography
Loaded via `next/font` in `app/layout.tsx` (variables on `<html>`). Do **not** re-import via CSS `@import`.
- **UI + display (all headings, labels, body):** **Hanken Grotesk** — var `--font-sans`, Tailwind `font-sans`. One well-tuned grotesk; weight/size contrast does the work a display/body pair would. (Deliberately not Inter/Plus Jakarta/Geist — those are reflex defaults.)
- **Code / console / step timings / selectors / IDs / durations:** **JetBrains Mono** — var `--font-mono`, Tailwind `font-mono`. This is brand: the live console is the hero, so its monospace is pinned, never a system fallback.
- **Headings:** weight 700, `letter-spacing: -0.018em`; `text-wrap: balance`. Body `text-wrap: pretty`.
- **Scale:** product-register — a fixed rem scale (`text-sm`/`text-base` body, `text-2xl`/`3xl` page titles). Display sizes (`text-5xl`+) tighten tracking; reserved for the landing/brand surfaces only.

## Color
OKLCH custom properties in `globals.css` as `L C H` triplets, wrapped by Tailwind as `oklch(var(--token) / <alpha-value>)` so opacity utilities (`bg-primary/10`) work. **Light is the default theme; `.dark` is the "Instrument" variant.** Author in tokens — never hardcode hex, never use raw `violet-*`/`indigo-*`/`slate-*` palette classes.
- **Primary (mineral teal):** light `oklch(0.50 0.105 197)`, dark `oklch(0.74 0.11 192)`. Primary actions, focus ring, brand, selection. White text on the light primary (≥4.5:1).
- **Neutrals (light):** canvas `oklch(0.985 0.004 230)`, card pure white, border `oklch(0.912 0.005 230)`, muted text `oklch(0.46 0.02 245)` (AA on canvas + card).
- **Neutrals (dark / "Instrument"):** canvas `oklch(0.165 0.006 240)` (true-ish near-black, faint cool), card `oklch(0.205 …)`, 1px hairline borders. No blur, no glow.
- **Semantic (owns test/bug state):** `--success` (green=passed), `--destructive` (red=failed), `--warning` (amber=error/warn), `--info` (blue=running). Each has a `-foreground`. Use tints (`bg-success/15 text-success`) for badges. **Never use the brand teal to signal status.**
- **Console (the lit readout, dark in BOTH themes):** `--console`, `--console-foreground`, `--console-muted`, `--console-border`, and bright `--console-success/-error/-info/-accent` for log lines. Used only for terminal-like surfaces.
- **Sidebar:** its own slightly-cool neutral layer (`--sidebar*`).

## Components
- **Primitive layer:** shadcn/ui on Radix in `components/ui/` (button, card, badge, input, textarea, label, select, dialog, dropdown-menu, sheet, tabs, tooltip, separator, skeleton, avatar, switch, scroll-area, sonner). Build on these — don't hand-roll buttons/inputs/modals.
- **Shared patterns:** `components/shared/` — `PageHeader`, `EmptyState`, `Spinner`/`CenteredSpinner`, `Stat`/`StatGroup`, and `StatusBadge`/`StatusDot`/`SeverityBadge` (single source of truth mapping every run/step/bug status to a semantic badge + lucide icon). Brand mark: `components/brand/logo.tsx`.
- **Icons:** **lucide-react** only. No emoji, no hand-rolled SVG icon paths.
- Every interactive component ships its full state set (default/hover/focus/active/disabled/loading). Loading uses Spinner/Skeleton, not bare spinner divs.

## Spacing & Layout
- 4px base; comfortable density. Cards `p-5`/`p-6`; page sections `space-y-6`/`space-y-8`.
- **Radius:** `--radius: 0.625rem`. Tailwind `lg` = radius, `md` = −2px, `sm` = −4px; `full` for pills/avatars.
- App content is grid-disciplined (sticky sidebar + content; run-detail is a `55% / 1fr` two-column of steps + console). Landing is brand-register and may be more expressive.

## Motion
- Product motion is 150–250ms, conveys state only (hover, transitions, Radix open/close via `tailwindcss-animate`). No orchestrated page-load sequences, no decorative loops.
- The live indicators (running dot, console caret) are the meaningful exceptions.
- **Reduced motion:** all animation/transition collapses to ~0 under `prefers-reduced-motion: reduce` (guard in `globals.css`). Keep it that way.

## Rules (the discipline that keeps this from sliding back into AI-slop)
1. **No glassmorphism as a surface.** Solid `bg-card`/`bg-background` with 1px borders. Backdrop-blur only on a sticky nav scrim — never as default card/panel chrome.
2. **No gradient text and no gradient-fill buttons/cards.** Wordmarks and CTAs are solid color. The only gradients allowed are the faint `.bg-grid` blueprint graticule and modal scrims.
3. **No glow.** No colored `box-shadow`, no `glow-*`, no pulsing-glow loops. Elevation is a hairline border + at most a small neutral `shadow-sm`.
4. **Teal is rare and earns its place.** One primary action per view, focus ring, brand, selection. Don't tint large surfaces teal.
5. **Semantic colors own state.** Green=passed, red=failed, blue=running, amber=error/warn, gray=skipped/pending. Status always renders through `StatusBadge`/`StatusDot`.
6. **Monospace for anything that's code/output/measurement.** Console, step timings, selectors, IDs, exported code, durations.
7. **No eyebrow scaffolding.** No repeated tiny UPPERCASE letter-spaced labels above sections. Use a real sentence-case heading.
8. **One accent family.** Neutrals + teal + the semantic set. No second decorative color.
9. **The console is the only dark hero.** Keep it lit and instrument-like; don't darken the rest of the app to compete with it.
10. **Respect reduced motion.** Never ship animation that ignores the guard.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-12 | Initial DESIGN.md codifying the dark/violet/glass system | Existing system was coherent but undocumented |
| 2026-06-19 | **Full redesign → "Blueprint" (light + mineral-teal, dark console as hero).** Replaced the dark-violet-glow/glassmorphism/gradient-text system; rebuilt on shadcn/ui + Radix with OKLCH tokens, Hanken Grotesk + JetBrains Mono, light default + de-slopped "Instrument" dark variant. | Owner judged the prior UI "AI-slop"; the prior aesthetic *was* the saturated AI dev-tool template. Blueprint escapes both that reflex and the editorial-serif reflex. Explicit owner approval to deviate from the prior locked system. |

### Notes
- The prior `globals.css` utilities (`.glass-card`, `.glass-sidebar`, `.glow-*`, `.gradient-text*`, `.hero-gradient`, `animate-pulse-glow`/`shimmer`/`float`) were removed. Do not reintroduce them.
- `GOAL.md` gates 1.6 / 3.2 were certified against the *old* DESIGN.md and remain as historical record; this file is the current source of truth.
