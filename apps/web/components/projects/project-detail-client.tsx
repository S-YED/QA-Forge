'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { TestSuitesTab } from '@/components/projects/test-suites-tab';
import { TestRunsTab } from '@/components/projects/test-runs-tab';
import { TestRecordingsTab } from '@/components/projects/test-recordings-tab';
import { AIGeneratePanel } from '@/components/projects/ai-generate-panel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Stat, StatGroup } from '@/components/shared/stat';
import { CenteredSpinner } from '@/components/shared/spinner';
import type { Project, TestSuite, TestRun } from '@qaforge/shared-types';

interface ProjectDetailResponse {
  project: Project;
  stats: { total_runs: number; passed_runs: number; failed_runs: number };
}

interface SuitesResponse {
  suites: (TestSuite & { test_cases: [{ count: number }] })[];
}

interface RunsResponse {
  test_runs: TestRun[];
  count: number;
  page: number;
  per_page: number;
}

type TabId = 'suites' | 'runs' | 'recordings';

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState({ total_runs: 0, passed_runs: 0, failed_runs: 0 });
  const [suites, setSuites] = useState<SuitesResponse['suites']>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [runsCount, setRunsCount] = useState(0);
  const [recordingsCount, setRecordingsCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('suites');
  const [loading, setLoading] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const data = await apiClient.get<ProjectDetailResponse>(`/api/projects/${projectId}`);
      setProject(data.project);
      setStats(data.stats);
    } catch {
      router.push('/dashboard/projects');
    }
  }, [projectId, router]);

  const fetchSuites = useCallback(async () => {
    try {
      const data = await apiClient.get<SuitesResponse>(`/api/projects/${projectId}/test-suites`);
      setSuites(data.suites ?? []);
    } catch {
      /* handled by apiClient */
    }
  }, [projectId]);

  const fetchRuns = useCallback(
    async (page = 1) => {
      try {
        const data = await apiClient.get<RunsResponse>(
          `/api/projects/${projectId}/test-runs?page=${page}&per_page=20`,
        );
        setRuns(data.test_runs ?? []);
        setRunsCount(data.count ?? 0);
      } catch {
        /* handled by apiClient */
      }
    },
    [projectId],
  );

  const fetchRecordings = useCallback(async () => {
    try {
      const data = await apiClient.get<{ recorded_sessions: unknown[] }>(
        `/api/projects/${projectId}/recorded-sessions`,
      );
      setRecordingsCount(data.recorded_sessions?.length ?? 0);
    } catch {
      /* handled by apiClient */
    }
  }, [projectId]);

  useEffect(() => {
    Promise.all([fetchProject(), fetchSuites(), fetchRuns(), fetchRecordings()]).finally(() =>
      setLoading(false),
    );
  }, [fetchProject, fetchSuites, fetchRuns, fetchRecordings]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'suites', label: 'Suites', count: suites.length },
    { id: 'runs', label: 'Runs', count: runsCount },
    { id: 'recordings', label: 'Recordings', count: recordingsCount },
  ];

  if (loading) {
    return <CenteredSpinner label="Loading project…" />;
  }

  if (!project) return null;

  const passRate =
    stats.total_runs > 0 ? Math.round((stats.passed_runs / stats.total_runs) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* ── Overview header ────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => router.push('/dashboard/projects')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to projects
        </button>

        <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2.5">
            <h1 className="truncate text-2xl font-bold tracking-tight lg:text-3xl">
              {project.name}
            </h1>
            {project.description && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            )}
            {project.base_url && (
              <a
                href={project.base_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Globe className="size-3.5 shrink-0 text-primary" />
                <span className="truncate font-mono">{project.base_url}</span>
              </a>
            )}
          </div>

          <div className="shrink-0 rounded-lg border bg-card px-5 py-4">
            <StatGroup>
              <Stat label="Total runs" value={stats.total_runs} />
              <Stat label="Passed" value={stats.passed_runs} valueClassName="text-success" />
              <Stat
                label="Failed"
                value={stats.failed_runs}
                valueClassName={stats.failed_runs > 0 ? 'text-destructive' : undefined}
              />
              {stats.total_runs > 0 && (
                <Stat
                  label="Pass rate"
                  value={`${passRate}%`}
                  valueClassName={
                    passRate >= 80
                      ? 'text-success'
                      : passRate >= 50
                        ? 'text-warning'
                        : 'text-destructive'
                  }
                />
              )}
            </StatGroup>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
                <span className="font-mono text-xs text-muted-foreground">{tab.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <Button onClick={() => setShowAIPanel(true)}>
            <Sparkles />
            AI generate
          </Button>
        </div>

        <TabsContent value="suites">
          <TestSuitesTab projectId={projectId} suites={suites} onRefresh={fetchSuites} />
        </TabsContent>
        <TabsContent value="runs">
          <TestRunsTab projectId={projectId} runs={runs} totalCount={runsCount} onRefresh={fetchRuns} />
        </TabsContent>
        <TabsContent value="recordings">
          <TestRecordingsTab projectId={projectId} />
        </TabsContent>
      </Tabs>

      {/* ── AI Generate slide-over ─────────────────────────────────────────── */}
      <AIGeneratePanel
        projectId={projectId}
        suites={suites}
        open={showAIPanel}
        onClose={() => setShowAIPanel(false)}
        onGenerated={() => {
          setShowAIPanel(false);
          fetchSuites();
        }}
      />
    </div>
  );
}
