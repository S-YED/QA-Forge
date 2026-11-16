'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { TestSuitesTab } from '@/components/projects/test-suites-tab';
import { TestRunsTab } from '@/components/projects/test-runs-tab';
import { TestRecordingsTab } from '@/components/projects/test-recordings-tab';
import { ProjectVariablesTab, type ProjectVariable } from '@/components/projects/project-variables-tab';
import { ProjectAutomationTab } from '@/components/projects/project-automation-tab';
import { ProjectOverviewTab, passRate, rateTone, type ProjectOverview } from '@/components/projects/project-overview-tab';
import { ProjectActions } from '@/components/projects/project-actions';
import { TestBugsTab, type ProjectBug } from '@/components/projects/test-bugs-tab';
import { AIGeneratePanel } from '@/components/projects/ai-generate-panel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Stat, StatGroup } from '@/components/shared/stat';
import { ProjectDetailSkeleton } from '@/components/shared/page-skeletons';
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

type TabId = 'overview' | 'suites' | 'runs' | 'bugs' | 'recordings' | 'variables' | 'automation';

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState({ total_runs: 0, passed_runs: 0, failed_runs: 0 });
  const [suites, setSuites] = useState<SuitesResponse['suites']>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [runsCount, setRunsCount] = useState(0);
  const [recordingsCount, setRecordingsCount] = useState(0);
  const [bugs, setBugs] = useState<ProjectBug[]>([]);
  const [bugsCount, setBugsCount] = useState(0);
  // "Load more" appends the next page (the API serves at most 50 per page).
  const [runsPage, setRunsPage] = useState(1);
  const [bugsPage, setBugsPage] = useState(1);
  const [activeTab, setActiveTab] = useState<TabId>('suites');
  const [loading, setLoading] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const data = await apiClient.get<ProjectDetailResponse>(`/api/projects/${projectId}`);
      setProject(data.project);
      setStats(data.stats);
    } catch (err) {
      toastError('Could not open this project', err);
      router.push('/dashboard/projects');
    }
  }, [projectId, router]);

  const fetchSuites = useCallback(async () => {
    try {
      const data = await apiClient.get<SuitesResponse>(`/api/projects/${projectId}/test-suites`);
      setSuites(data.suites ?? []);
    } catch (err) {
      toastError('Could not load test suites', err);
    }
  }, [projectId]);

  const fetchRuns = useCallback(
    async (page = 1) => {
      try {
        const data = await apiClient.get<RunsResponse>(
          `/api/projects/${projectId}/test-runs?page=${page}&per_page=20`,
        );
        setRuns((prev) => (page === 1 ? (data.test_runs ?? []) : [...prev, ...(data.test_runs ?? [])]));
        setRunsCount(data.count ?? 0);
        setRunsPage(page);
      } catch (err) {
        toastError('Could not load runs', err);
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
    } catch (err) {
      toastError('Could not load recordings', err);
    }
  }, [projectId]);

  const fetchBugs = useCallback(async (page = 1) => {
    try {
      const data = await apiClient.get<{ bugs: ProjectBug[]; count: number }>(
        `/api/projects/${projectId}/bugs?page=${page}&per_page=20`,
      );
      setBugs((prev) => (page === 1 ? (data.bugs ?? []) : [...prev, ...(data.bugs ?? [])]));
      setBugsCount(data.count ?? 0);
      setBugsPage(page);
    } catch (err) {
      toastError('Could not load bugs', err);
    }
  }, [projectId]);

  // F4: values steps use as {{NAME}}. `available` is false until the database has the variables table.
  const [variables, setVariables] = useState<{ list: ProjectVariable[]; available: boolean }>({ list: [], available: true });
  const fetchVariables = useCallback(async () => {
    try {
      const data = await apiClient.get<{ variables: ProjectVariable[]; available: boolean }>(
        `/api/projects/${projectId}/variables`,
      );
      setVariables({ list: data.variables ?? [], available: data.available !== false });
    } catch (err) {
      toastError('Could not load variables', err);
    }
  }, [projectId]);

  // F5: health numbers, with days cut in the viewer's timezone. `available` is false until migration 30 exists.
  const [overview, setOverview] = useState<ProjectOverview>({ available: true });
  const fetchOverview = useCallback(async () => {
    try {
      const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setOverview(await apiClient.get<ProjectOverview>(`/api/projects/${projectId}/overview?tz=${tz}`));
    } catch (err) {
      toastError('Could not load the overview', err);
    }
  }, [projectId]);
  const lastResults = useMemo(
    () => Object.fromEntries((overview.cases ?? []).map((c) => [c.test_case_id, c])),
    [overview.cases],
  );

  useEffect(() => {
    Promise.all([fetchProject(), fetchSuites(), fetchRuns(), fetchRecordings(), fetchBugs(), fetchVariables(), fetchOverview()]).finally(() =>
      setLoading(false),
    );
  }, [fetchProject, fetchSuites, fetchRuns, fetchRecordings, fetchBugs, fetchVariables, fetchOverview]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'suites', label: 'Suites', count: suites.length },
    { id: 'runs', label: 'Runs', count: runsCount },
    { id: 'bugs', label: 'Bugs', count: bugsCount },
    { id: 'recordings', label: 'Recordings', count: recordingsCount },
    { id: 'variables', label: 'Variables', count: variables.list.length },
    { id: 'automation', label: 'Automation' },
  ];

  if (loading) {
    return <ProjectDetailSkeleton />;
  }

  if (!project) return null;

  // Same rule as the Overview tab: of the runs that ended as passed or failed.
  const allTimeRate = passRate(stats.passed_runs, stats.failed_runs);

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
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-tight lg:text-3xl">{project.name}</h1>
              <ProjectActions project={project} onSaved={fetchProject} />
            </div>
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
            <StatGroup className="flex-nowrap gap-x-5 sm:gap-x-8 [&>*+*]:pl-5 sm:[&>*+*]:pl-8">
              <Stat label="Total runs" value={stats.total_runs} />
              <Stat label="Passed" value={stats.passed_runs} valueClassName="text-success" />
              <Stat
                label="Failed"
                value={stats.failed_runs}
                valueClassName={stats.failed_runs > 0 ? 'text-destructive' : undefined}
              />
              {allTimeRate !== null && (
                <Stat label="Pass rate" value={`${allTimeRate}%`} valueClassName={rateTone(allTimeRate)} />
              )}
            </StatGroup>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* the tabs are wider than a phone: the row scrolls inside itself instead of pushing the page sideways */}
          <TabsList className="max-w-full justify-start overflow-x-auto [&>*]:shrink-0">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
                {tab.count !== undefined && <span className="font-mono text-xs text-muted-foreground">{tab.count}</span>}
              </TabsTrigger>
            ))}
          </TabsList>

          <Button onClick={() => setShowAIPanel(true)}>
            <Sparkles />
            AI generate
          </Button>
        </div>

        <TabsContent value="overview">
          <ProjectOverviewTab projectId={projectId} overview={overview} />
        </TabsContent>
        <TabsContent value="suites">
          <TestSuitesTab projectId={projectId} suites={suites} lastResults={lastResults} onRefresh={fetchSuites} />
        </TabsContent>
        <TabsContent value="runs">
          <TestRunsTab
            projectId={projectId}
            runs={runs}
            totalCount={runsCount}
            onRefresh={fetchRuns}
            onLoadMore={() => fetchRuns(runsPage + 1)}
          />
        </TabsContent>
        <TabsContent value="bugs">
          <TestBugsTab
            projectId={projectId}
            bugs={bugs}
            totalCount={bugsCount}
            onRefresh={() => fetchBugs(1)}
            onLoadMore={() => fetchBugs(bugsPage + 1)}
          />
        </TabsContent>
        <TabsContent value="recordings">
          <TestRecordingsTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="variables">
          <ProjectVariablesTab
            projectId={projectId}
            variables={variables.list}
            available={variables.available}
            onRefresh={fetchVariables}
          />
        </TabsContent>
        <TabsContent value="automation">
          <ProjectAutomationTab projectId={projectId} suites={suites.map((s) => ({ id: s.id, name: s.name }))} />
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
