import { ProjectDetailClient } from '@/components/projects/project-detail-client';

export default function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <ProjectDetailClient projectId={params.id} />;
}
