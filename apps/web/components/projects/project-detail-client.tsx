'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { TestSuitesTab } from '@/components/projects/test-suites-tab';
import { TestRunsTab } from '@/components/projects/test-runs-tab';
import { TestRecordingsTab } from '@/components/projects/test-recordings-tab';
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

  const fetchRecordings = useCallback(async () => {
    try {
      const data = await apiClient.get<{ recorded_sessions: any[] }>(
        `/api/projects/${projectId}/recorded-sessions`
      );
      setRecordingsCount(data.recorded_sessions?.length ?? 0);
    } catch { /* handled by apiClient */ }
  }, [projectId]);

  useEffect(() => {
    Promise.all([fetchProject(), fetchSuites(), fetchRuns(), fetchRecordings()]).finally(() =>
      setLoading(false),
    );
  }, [fetchProject, fetchSuites, fetchRuns, fetchRecordings]);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'suites', label: 'Test Suites', count: suites.length },
    { id: 'runs', label: 'Test Runs', count: runsCount },
    { id: 'recordings', label: 'Recordings', count: recordingsCount },
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
    <div className="space-y-8">
      {/* ── Overview Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <button
            onClick={() => router.push('/dashboard/projects')}
            className="group mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all duration-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="group-hover:-translate-x-0.5 transition-transform duration-300"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to Projects
          </button>
          
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 via-slate-100 to-slate-350 bg-clip-text text-transparent truncate">
            {project.name}
          </h1>
          
          {project.description && (
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              {project.description}
            </p>
          )}
          
          {project.base_url && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-950/60 border border-white/[0.04] px-3 py-1.5 w-fit max-w-full">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-violet-400 shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="text-xs text-slate-300 font-mono truncate">
                {project.base_url}
              </span>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:flex gap-4 shrink-0">
          <div className="rounded-2xl p-4 min-w-[110px] text-center glass-card glow-border flex flex-col justify-center items-center shadow-md shadow-slate-950/20">
            <p className="text-3xl font-extrabold text-slate-150 tracking-tight">{stats.total_runs}</p>
            <p className="text-[11px] font-bold text-slate-450 mt-1 uppercase tracking-wider">Total Runs</p>
          </div>
          <div className="rounded-2xl p-4 min-w-[110px] text-center glass-card glow-border flex flex-col justify-center items-center shadow-md shadow-emerald-500/5">
            <p className="text-3xl font-extrabold text-emerald-400 tracking-tight animate-pulse">{stats.passed_runs}</p>
            <p className="text-[11px] font-bold text-emerald-500/80 mt-1 uppercase tracking-wider">Passed</p>
          </div>
          <div className="rounded-2xl p-4 min-w-[110px] text-center glass-card glow-border flex flex-col justify-center items-center shadow-md shadow-red-500/5">
            <p className="text-3xl font-extrabold text-rose-400 tracking-tight">{stats.failed_runs}</p>
            <p className="text-[11px] font-bold text-rose-450 mt-1 uppercase tracking-wider">Failed</p>
          </div>
          {stats.total_runs > 0 && (
            <div className="rounded-2xl p-4 min-w-[110px] text-center glass-card glow-border flex flex-col justify-center items-center shadow-md">
              <p className={cn(
                "text-3xl font-extrabold tracking-tight",
                passRate >= 80 ? 'text-emerald-400' : passRate >= 50 ? 'text-amber-400' : 'text-rose-400'
              )}>
                {passRate}%
              </p>
              <p className="text-[11px] font-bold text-slate-450 mt-1 uppercase tracking-wider">Pass Rate</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-px">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-5 py-3.5 text-sm font-bold transition-all duration-300 ease-out-quint',
                activeTab === tab.id
                  ? 'text-violet-300'
                  : 'text-slate-450 hover:text-slate-200',
              )}
            >
              <span className="flex items-center gap-1.5">
                {tab.label}
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  activeTab === tab.id 
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" 
                    : "bg-white/[0.04] text-slate-400 border border-white/[0.04]"
                )}>
                  {tab.count}
                </span>
              </span>
              
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-violet-500 to-indigo-500 rounded-t shadow-md shadow-violet-500" />
              )}
            </button>
          ))}
        </div>

        {/* AI Generate FAB */}
        <button
          onClick={() => setShowAIPanel(true)}
          className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/10 transition-all duration-300 hover:shadow-violet-500/25 active:scale-[0.97]"
        >
          {/* Pulsate effect overlay */}
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5"
            className="animate-spin-slow text-violet-200"
          >
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
      {activeTab === 'recordings' && (
        <TestRecordingsTab
          projectId={projectId}
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
