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
        title="Set up on each project"
        description="Tokens that let a build such as GitHub Actions run your suites are under Automation on each project page. Slack notices when a suite run fails are coming soon. Filing bugs into Jira or GitHub is not available yet."
      />
    </div>
  );
}
