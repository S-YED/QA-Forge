import { Plug } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connect QA Forge with your favorite tools."
      />

      <EmptyState
        icon={Plug}
        title="Coming soon"
        description="Integrations with Jira, GitHub, Slack, and other tools are planned for a future release. Stay tuned."
      />
    </div>
  );
}
