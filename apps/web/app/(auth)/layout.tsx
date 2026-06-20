import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      {/* Faint engineering graticule, masked to a soft vignette behind the shell */}
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black,transparent)]" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <Link href="/" className="mb-8 rounded-md" aria-label="QA Forge home">
          <Logo />
        </Link>
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
