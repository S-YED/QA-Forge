import { RecordingPortal } from '@/components/recordings/recording-portal';

interface RecordingDetailPageProps {
  params: {
    id: string;
    sessionId: string;
  };
}

export default function RecordingDetailPage({ params }: RecordingDetailPageProps) {
  return (
    <RecordingPortal
      projectId={params.id}
      sessionId={params.sessionId}
    />
  );
}
