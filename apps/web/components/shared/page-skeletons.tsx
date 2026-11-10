import { Skeleton } from '@/components/ui/skeleton';

/**
 * Page-shaped loading states: each mirrors the layout it stands in for, so navigation shows the page's shape at
 * once instead of a frozen screen or a generic spinner. Used by the route `loading.tsx` files and by client pages
 * while their data loads.
 */
function Loading({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <Loading label="Loading projects">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border bg-card p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-md" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </Loading>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <Loading label="Loading project">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-6 w-56" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg lg:w-96" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Rows count={4} />
    </Loading>
  );
}

export function RunDetailSkeleton() {
  return (
    <Loading label="Loading run">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[55%_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-4">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </Loading>
  );
}

export function RecordingSkeleton() {
  return (
    <Loading label="Loading recording workbench">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Skeleton className="aspect-video rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </Loading>
  );
}

export function SettingsSkeleton() {
  return (
    <Loading label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="max-w-2xl space-y-4 rounded-lg border bg-card p-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-28" />
      </div>
    </Loading>
  );
}

/** A list inside a page section (e.g. the Recordings tab). */
export function ListSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <Loading label={label}>
      <Rows count={count} />
    </Loading>
  );
}
