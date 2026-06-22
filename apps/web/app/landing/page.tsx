import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Sparkles,
  MonitorPlay,
  Bug,
  ShieldCheck,
  ArrowRight,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'QA Forge - AI test automation you can watch run',
  description:
    'Describe a test in plain English. AI writes the Playwright script. Watch it execute live, step by step, with screenshots and auto-filed bugs.',
};

const features: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Sparkles,
    title: 'AI test generation',
    description:
      'Describe what to test in plain English. A multi-model engine (GPT-4o, Claude, Gemini) writes complete Playwright cases - selectors, assertions, and edge cases - in seconds.',
  },
  {
    icon: MonitorPlay,
    title: 'Live browser execution',
    description:
      'Watch every test run in real time over WebSocket. Each click, assertion, and screenshot streams to your dashboard across Chromium, Firefox, and WebKit.',
  },
  {
    icon: Bug,
    title: 'Automatic bug reports',
    description:
      'When a test fails, QA Forge files a structured bug with the failing step, screenshot, error message, and environment context. Zero manual triage.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by construction',
    description:
      'AES-256-GCM encryption for every API key. Row-Level Security on every table. Live JWT validation and built-in rate limiting on each request.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Describe your test',
    description: 'Write what you want to verify in plain English - no code, no selectors, no setup.',
    example: 'Test login with valid, wrong, and empty credentials',
  },
  {
    number: '02',
    title: 'AI generates the cases',
    description: 'The multi-model engine writes comprehensive Playwright scripts in seconds.',
    example: '→ 6 cases · selectors · assertions · edge cases',
  },
  {
    number: '03',
    title: 'Watch them run live',
    description: 'Execute against any URL and watch every step stream in over WebSocket.',
    example: '→ live screenshots · per-step timing · verdict',
  },
];

const techStack = [
  'Playwright',
  'OpenAI GPT-4o',
  'Claude',
  'Gemini',
  'OpenRouter',
  'Next.js 15',
  'Supabase',
  'Socket.io',
  'TypeScript',
];

function ConsolePreview() {
  const rows = [
    { glyph: '⚙', text: 'Connected to execution server', cls: 'text-console-accent' },
    { glyph: '▶', text: 'Launching browser…', cls: 'text-console-info' },
    { glyph: '✓', text: 'navigate → /login (212ms)', cls: 'text-console-success' },
    { glyph: '✓', text: 'fill [name=email] (88ms)', cls: 'text-console-success' },
    { glyph: '✓', text: 'click [type=submit] (142ms)', cls: 'text-console-success' },
    { glyph: '✓', text: 'assert dashboard visible (96ms)', cls: 'text-console-success' },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-console-border bg-console shadow-2xl shadow-foreground/5">
      <div className="flex items-center gap-2 border-b border-console-border px-4 py-2.5">
        <TerminalSquare className="size-4 text-console-muted" aria-hidden="true" />
        <span className="font-mono text-xs text-console-muted">test-execution.log</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-console-info">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-console-info opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-console-info" />
          </span>
          Live
        </span>
      </div>
      <div className="space-y-1 p-4 font-mono text-xs leading-relaxed">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2.5">
            <span className="select-none text-console-muted/70">10:24:0{i}</span>
            <span className={r.cls}>
              <span className="mr-1.5 opacity-90">{r.glyph}</span>
              {r.text}
            </span>
          </div>
        ))}
        <div className="flex gap-2.5 pt-1 text-console-success">
          <span className="select-none text-console-muted/70">10:24:07</span>
          <span className="font-semibold">All steps passed ✓ (1.5s)</span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/demo">Live demo</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">
                Get started
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative border-b border-border">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              Live read-only demo · no signup
            </span>
            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              QA that thinks like an engineer.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Describe a test in plain English. AI writes the Playwright script. Watch every step
              execute live - with screenshots, timings, and bugs filed automatically.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/demo">
                  Try the live demo
                  <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Create free account</Link>
              </Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              No credit card required · Built with TypeScript end to end
            </p>
          </div>

          <div className="lg:pl-4">
            <ConsolePreview />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:px-8 lg:py-24">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Everything a QA team needs, minus the busywork.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            From a plain-English prompt to a passing test with evidence attached - in one flow.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex gap-4 bg-card p-7">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {f.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How it works (a genuine ordered sequence) ── */}
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 lg:py-24">
          <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            From idea to passing test in three steps.
          </h2>

          <ol className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <li key={step.number} className="relative">
                <div className="font-mono text-sm font-semibold text-primary">{step.number}</div>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
                <code className="mt-4 block rounded-md border border-border bg-card px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
                  {step.example}
                </code>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <p className="text-sm font-medium text-muted-foreground">Built with a production stack</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {techStack.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-foreground"
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* ── Closing CTA - the one dark instrument band ── */}
      <section className="mx-auto max-w-6xl px-5 pb-20 md:px-8">
        <div className="bg-grid relative overflow-hidden rounded-2xl border border-console-border bg-console px-8 py-14 text-center md:py-16">
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-console-foreground sm:text-4xl">
              See a test write itself and run.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-console-muted">
              No credit card. No setup. Open the demo and watch Playwright execute, step by step.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/demo">
                  Try the live demo
                  <ArrowRight />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-console-border bg-transparent text-console-foreground hover:bg-white/5 hover:text-console-foreground"
              >
                <Link href="/login">Create free account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row md:px-8">
          <div className="flex items-center gap-2">
            <LogoMark className="size-6" />
            <span className="font-semibold text-foreground">QA Forge</span>
            <span>· Built by SYED · {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/demo" className="transition-colors hover:text-foreground">
              Demo
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <a
              href="https://github.com/S-YED"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
