import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="text-7xl font-extrabold tracking-tight gradient-text mb-4 font-mono">404</p>
        <h1 className="text-2xl font-extrabold tracking-tight mb-2">Page not found</h1>
        <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 hover:bg-violet-500 transition-all duration-200"
          >
            Back to Home
          </Link>
          <Link
            href="/dashboard/projects"
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-all duration-200"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
