export default function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Detail</h1>
        <p className="text-muted-foreground mt-1">
          Project ID: {params.id}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <path d="M6 3h12l4 6-10 13L2 9Z" />
            <path d="M11 3 8 9l4 13 4-13-3-6" />
            <path d="M2 9h20" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold">Coming in MVP-2</h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Project details including test runs, recorded sessions, and AI-powered
          test generation will be available in the next release.
        </p>
      </div>
    </div>
  );
}
