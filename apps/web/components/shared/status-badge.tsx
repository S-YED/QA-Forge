import {
  Check,
  X,
  TriangleAlert,
  Circle,
  Minus,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'destructive' | 'warning' | 'info' | 'neutral' | 'pending';

interface StatusMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

// Single source of truth for run / step status presentation.
const RUN_STATUS: Record<string, StatusMeta> = {
  passed: { label: 'Passed', tone: 'success', icon: Check },
  failed: { label: 'Failed', tone: 'destructive', icon: X },
  error: { label: 'Error', tone: 'warning', icon: TriangleAlert },
  running: { label: 'Running', tone: 'info', icon: Circle },
  pending: { label: 'Pending', tone: 'pending', icon: CircleDashed },
  queued: { label: 'Queued', tone: 'pending', icon: CircleDashed },
  skipped: { label: 'Skipped', tone: 'neutral', icon: Minus },
};

const toneToVariant: Record<Tone, BadgeProps['variant']> = {
  success: 'success',
  destructive: 'destructive',
  warning: 'warning',
  info: 'info',
  neutral: 'secondary',
  pending: 'outline',
};

export function getStatusMeta(status: string): StatusMeta {
  return RUN_STATUS[status] ?? { label: status, tone: 'neutral', icon: Circle };
}

const toneText: Record<Tone, string> = {
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
  neutral: 'text-muted-foreground',
  pending: 'text-muted-foreground',
};

/** A small filled dot for inline status, pulsing when live/running. */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  const { tone } = getStatusMeta(status);
  const live = status === 'running';
  return (
    <span className={cn('relative flex size-2', className)} aria-hidden="true">
      {live && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60" />
      )}
      <span className={cn('relative inline-flex size-2 rounded-full', `bg-current`, toneText[tone])} />
    </span>
  );
}

export function StatusBadge({
  status,
  className,
  showIcon = true,
}: {
  status: string;
  className?: string;
  showIcon?: boolean;
}) {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  const live = status === 'running';
  return (
    <Badge variant={toneToVariant[meta.tone]} className={cn('font-medium', className)}>
      {live ? (
        <StatusDot status={status} className="size-1.5" />
      ) : (
        showIcon && <Icon className="size-3" />
      )}
      {meta.label}
    </Badge>
  );
}

const SEVERITY: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  critical: { label: 'Critical', variant: 'destructive' },
  high: { label: 'High', variant: 'warning' },
  medium: { label: 'Medium', variant: 'warning' },
  low: { label: 'Low', variant: 'secondary' },
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const meta = SEVERITY[severity] ?? { label: severity, variant: 'secondary' as const };
  return (
    <Badge variant={meta.variant} className={cn('capitalize', className)}>
      {meta.label}
    </Badge>
  );
}
