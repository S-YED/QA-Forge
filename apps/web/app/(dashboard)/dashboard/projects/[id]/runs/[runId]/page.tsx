import { RunDetailClient } from '@/components/projects/run-detail-client';

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  // keyed by run: "Run again" opens another run on this same route, and it must start from a clean page
  return <RunDetailClient key={runId} projectId={id} runId={runId} />;
}
