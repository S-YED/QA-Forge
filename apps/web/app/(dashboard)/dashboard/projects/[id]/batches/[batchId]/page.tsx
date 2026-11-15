import { BatchDetailClient } from '@/components/projects/batch-detail-client';

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { id, batchId } = await params;
  return <BatchDetailClient projectId={id} batchId={batchId} />;
}
