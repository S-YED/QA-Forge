'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { TestSuitesTab } from '@/components/projects/test-suites-tab';
import { TestRunsTab } from '@/components/projects/test-runs-tab';
import { AIGeneratePanel } from '@/components/projects/ai-generate-panel';
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

type TabId = 'suites' | 'runs';

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState({ total_runs: 0, passed_runs: 0, failed_runs: 0 });
  const [suites, setSuites] = useState<SuitesResponse['suites']>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [runsCount, setRunsCount] = useState(0);
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
      const data = await apiClient.get<SuitesResponse>(
        `/api/projects/${projectId}/test-suites`,
      );
      setSuites(data.suites ?? []);
    } catch { /* handled by apiClient */ }
  }, [projectId]);

  const fetchRuns = useCallback(async (page = 1) => {
    try {
      const data = await apiClient.get<RunsResponse>(
        `/api/projects/${projectId}/test-runs?page=${page}&per_page=20`,
      );
      setRuns(data.test_runs ?? []);
      setRunsCount(data.count ?? 0);
    } catch { /* handled by apiClient */ }
  }, [projectId]);

  useEffect(() => {
    Promise.all([fetchProject(), fetchSuites(), fetchRuns()]).finally(() =>
      setLoading(false),
    );
  }, [fetchProject, fetchSuites, fetchRuns]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'suites', label: 'Test Suites', count: suites.length },
    { id: 'runs', label: 'Test Runs', count: runsCount },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!project) return null;

  const passRate = stats.total_runs > 0
    ? Math.round((stats.passed_runs / stats.total_runs) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Overview Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Projects
          </button>
          <h1 className="text-3xl font-bold tracking-tight truncate">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
          )}
          {project.base_url && (
            <p className="mt-1 text-xs font-mono text-muted-foreground/70 truncate">
              {project.base_url}
            </p>
          )}
        </div>

        {/* Stats Cards */}
        <div className="flex gap-3 shrink-0">
          <div className="rounded-lg border bg-card p-3 min-w-[100px] text-center shadow-sm">
            <p className="text-2xl font-bold">{stats.total_runs}</p>
            <p className="text-xs text-muted-foreground">Total Runs</p>
          </div>
          <div className="rounded-lg border bg-card p-3 min-w-[100px] text-center shadow-sm">
            <p className="text-2xl font-bold text-emerald-500">{stats.passed_runs}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </div>
          <div className="rounded-lg border bg-card p-3 min-w-[100px] text-center shadow-sm">
            <p className="text-2xl font-bold text-red-400">{stats.failed_runs}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
          {stats.total_runs > 0 && (
            <div className="rounded-lg border bg-card p-3 min-w-[100px] text-center shadow-sm">
              <p className={cn("text-2xl font-bold", passRate >= 80 ? 'text-emerald-500' : passRate >= 50 ? 'text-amber-400' : 'text-red-400')}>
                {passRate}%
              </p>
              <p className="text-xs text-muted-foreground">Pass Rate</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-4 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-muted-foreground/60">({tab.count})</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* AI Generate FAB */}
        <button
          onClick={() => setShowAIPanel(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg hover:from-violet-500 hover:to-indigo-500 active:scale-[0.98]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3m6.36-.64-2.12 2.12M21 12h-3M18.36 18.36l-2.12-2.12M12 21v-3M5.64 18.36l2.12-2.12M3 12h3M5.64 5.64l2.12 2.12"/>
          </svg>
          AI Generate
        </button>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      {activeTab === 'suites' && (
        <TestSuitesTab
          projectId={projectId}
          suites={suites}
          onRefresh={fetchSuites}
        />
      )}
      {activeTab === 'runs' && (
        <TestRunsTab
          projectId={projectId}
          runs={runs}
          totalCount={runsCount}
          onRefresh={fetchRuns}
        />
      )}

      {/* ── AI Generate Slide-over Panel ───────────────────────────────────── */}
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
