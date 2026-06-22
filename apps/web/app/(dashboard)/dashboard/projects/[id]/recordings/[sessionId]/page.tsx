import { RecordingPortal } from '@/components/recordings/recording-portal';

interface RecordingDetailPageProps {
  params: Promise<{
    id: string;
    sessionId: string;
  }>;
}

export default async function RecordingDetailPage({ params }: RecordingDetailPageProps) {
  const { id, sessionId } = await params;
  return (
    <RecordingPortal
      projectId={id}
      sessionId={sessionId}
    />
  );
}
