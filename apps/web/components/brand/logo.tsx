import { cn } from '@/lib/utils';

/** QA Forge mark - a "verified" glyph (open gauge ring + check): the product is
 *  proof that a test passed. Solid teal tile, solid wordmark. No gradient. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[58%]"
      >
        <path d="M21 12a9 9 0 1 1-5.6-8.33" />
        <path d="m8.5 12 2.5 2.5L21 5" />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={cn('size-8', markClassName)} />
      {showWordmark && (
        <span className="text-[0.95rem] font-bold tracking-tight text-foreground">QA Forge</span>
      )}
    </span>
  );
}
