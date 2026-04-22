import { RunDetailClient } from '@/components/projects/run-detail-client';

export default function RunDetailPage({
  params,
}: {
  params: { id: string; runId: string };
}) {
  return <RunDetailClient projectId={params.id} runId={params.runId} />;
}
