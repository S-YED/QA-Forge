import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_55%_50%_at_50%_45%,black,transparent)]" />

      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <LogoMark className="size-12" />
        <p className="mt-8 font-mono text-6xl font-bold tracking-tight text-foreground sm:text-7xl">
          404
        </p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/projects">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
