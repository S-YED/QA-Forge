import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'QA Forge — AI-Powered Test Automation Platform',
  description:
    'Describe tests in plain English. AI generates Playwright scripts. Watch them execute live. The QA platform that thinks like an engineer.',
};

const features = [
  {
    icon: '🧠',
    title: 'AI Test Generation',
    description:
      'Describe what to test in plain English. Our multi-model AI engine (GPT-4o, Claude, Gemini) generates complete Playwright test cases with selectors, assertions, and edge cases in seconds.',
    color: 'from-violet-500/10 to-indigo-500/5',
    border: 'border-violet-500/20',
  },
  {
    icon: '🎭',
    title: 'Live Browser Execution',
    description:
      'Watch tests run in real-time via WebSocket streaming. Every click, assertion, and screenshot — streamed to your dashboard as it happens across Chromium, Firefox, and WebKit.',
    color: 'from-indigo-500/10 to-blue-500/5',
    border: 'border-indigo-500/20',
  },
  {
    icon: '🐛',
    title: 'Auto Bug Detection',
    description:
      'When tests fail, QA Forge automatically creates structured bug reports with the exact failure step, screenshot, error message, and environment context. Zero manual triage.',
    color: 'from-rose-500/10 to-pink-500/5',
    border: 'border-rose-500/20',
  },
  {
    icon: '🔐',
    title: 'Enterprise Security',
    description:
      'AES-256-GCM encryption for all API keys. Row-Level Security on every database table. JWT auth with live token validation on every request. Rate limiting built in.',
    color: 'from-emerald-500/10 to-teal-500/5',
    border: 'border-emerald-500/20',
  },
];

const steps = [
  {
    number: '01',
    title: 'Describe Your Test',
    description: 'Write what you want to test in plain English — no code, no selectors, no setup.',
    example: '"Test login with valid credentials, wrong password, and empty fields"',
  },
  {
    number: '02',
    title: 'AI Generates Test Cases',
    description: 'QA Forge\'s multi-model AI engine creates comprehensive Playwright scripts in seconds.',
    example: '→ 6 test cases generated with selectors, assertions & edge cases',
  },
  {
    number: '03',
    title: 'Watch Them Run Live',
    description: 'Execute against any URL. Watch every step via real-time WebSocket streaming.',
    example: '→ Live screenshots, per-step timing, pass/fail verdict',
  },
];

const techStack = [
  { name: 'Playwright', icon: '🎭', desc: 'Cross-browser automation' },
  { name: 'OpenAI GPT-4o', icon: '🤖', desc: 'AI test generation' },
  { name: 'Claude Haiku', icon: '🔮', desc: 'Multi-model AI' },
  { name: 'Gemini 2.0', icon: '✨', desc: 'Google AI engine' },
  { name: 'Next.js 14', icon: '▲', desc: 'App router + SSR' },
  { name: 'Supabase', icon: '⚡', desc: 'Auth + PostgreSQL' },
  { name: 'Socket.io', icon: '📡', desc: 'Real-time streaming' },
  { name: 'TypeScript', icon: '🔷', desc: 'Full type safety' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navigation ── */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-6 md:px-12 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-lg shadow-violet-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-extrabold text-base tracking-tight gradient-text">QA Forge</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/demo"
            className="hidden sm:flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            Try Demo
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] transition-all duration-200"
          >
            Get Started →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6 md:px-12 hero-gradient overflow-hidden">
        {/* Background orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/5 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-0 w-[400px] h-[400px] rounded-full bg-indigo-600/5 blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/5 px-4 py-1.5 text-xs font-semibold text-violet-400 mb-8 animate-fade-in-up">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            AI-Powered · Real-Time · Open Architecture
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.05] animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            QA that{' '}
            <span className="gradient-text">thinks like</span>
            <br />
            an engineer
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            Describe your tests in <strong className="text-foreground">plain English</strong>. Let AI generate complete Playwright scripts.
            Watch them execute <strong className="text-foreground">live in your browser</strong> — with real-time screenshots and auto bug reports.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <Link
              href="/demo"
              className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-[1.03] transition-all duration-300"
            >
              <span>🚀</span> Try the Live Demo
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:translate-x-1">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-2xl border border-border bg-card px-8 py-4 text-base font-bold text-foreground hover:bg-muted hover:border-violet-500/30 transition-all duration-300"
            >
              Sign Up Free
            </Link>
          </div>

          {/* Social proof */}
          <p className="mt-8 text-xs text-muted-foreground animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            No credit card required · Read-only live demo · Built with TypeScript
          </p>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-widest uppercase text-violet-400 mb-3">Features</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Everything a QA team needs,{' '}
              <span className="gradient-text">minus the busywork</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`group relative rounded-2xl border ${f.border} bg-gradient-to-br ${f.color} p-7 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl glow-border`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 px-6 md:px-12 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-widest uppercase text-violet-400 mb-3">How It Works</p>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              From idea to passing test in{' '}
              <span className="gradient-text">3 steps</span>
            </h2>
          </div>

          <div className="space-y-6">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-6 md:gap-10 items-start p-7 rounded-2xl border border-border bg-card hover:border-violet-500/20 transition-all duration-300 hover:shadow-lg">
                <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-black text-sm shadow-lg shadow-violet-500/20">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-lg font-bold mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{step.description}</p>
                  <code className="text-xs font-mono text-violet-400 bg-violet-500/5 border border-violet-500/10 rounded-lg px-3 py-1.5 block">
                    {step.example}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section className="py-24 px-6 md:px-12 border-t border-border">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-4">Built With</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {techStack.map((tech) => (
              <div
                key={tech.name}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 hover:border-violet-500/20 hover:bg-violet-500/3 transition-all duration-300"
              >
                <span className="text-2xl">{tech.icon}</span>
                <span className="text-sm font-bold">{tech.name}</span>
                <span className="text-xs text-muted-foreground">{tech.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6 md:px-12 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-600/10 to-indigo-600/5 p-12 relative overflow-hidden">
            <div className="absolute inset-0 animate-shimmer" />
            <h2 className="relative text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Ready to forge{' '}
              <span className="gradient-text">quality?</span>
            </h2>
            <p className="relative text-muted-foreground mb-8 text-lg">
              No credit card. No setup. Just describe your first test and watch it run.
            </p>
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/demo"
                className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-[1.03] transition-all duration-300"
              >
                🚀 Try the Live Demo
              </Link>
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-2xl border border-border bg-background px-8 py-4 text-base font-bold hover:bg-muted transition-all duration-300"
              >
                Create Free Account →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 md:px-12 border-t border-border">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-tr from-violet-600 to-indigo-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-bold text-foreground">QA Forge</span>
            <span>· Built by SYED · {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/demo" className="hover:text-foreground transition-colors">Demo</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <a href="https://github.com/S-YED" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
