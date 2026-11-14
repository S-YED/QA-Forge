import { cn } from '@/lib/utils';

/** Restrained metric: small muted label, tabular value. Deliberately NOT the
 *  big-number-gradient SaaS hero template. Compose several in a StatGroup. */
export function Stat({
  label,
  value,
  hint,
  valueClassName,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground', valueClassName)}>
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        'flex flex-wrap items-stretch gap-x-8 gap-y-4 divide-border [&>*+*]:border-l [&>*+*]:border-border [&>*+*]:pl-8',
        className,
      )}
    >
      {children}
    </dl>
  );
}
