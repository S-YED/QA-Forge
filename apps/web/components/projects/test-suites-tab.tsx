'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { TestSuite, TestCase } from '@qaforge/shared-types';

interface SuiteWithCount extends TestSuite {
  test_cases: [{ count: number }];
}

interface TestSuitesTabProps {
  projectId: string;
  suites: SuiteWithCount[];
  onRefresh: () => void;
}

interface SuiteDetailResponse {
  suite: TestSuite;
  child_suites: TestSuite[];
  test_cases: TestCase[];
}

export function TestSuitesTab({ projectId, suites, onRefresh }: TestSuitesTabProps) {
  const router = useRouter();
  const [expandedSuiteId, setExpandedSuiteId] = useState<string | null>(null);
  const [suiteDetail, setSuiteDetail] = useState<SuiteDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSuiteName, setNewSuiteName] = useState('');
  const [newSuiteDescription, setNewSuiteDescription] = useState('');

  // Root-level suites (no parent)
  const rootSuites = suites.filter((s) => !s.parent_suite_id);

  const toggleSuite = async (suiteId: string) => {
    if (expandedSuiteId === suiteId) {
      setExpandedSuiteId(null);
      setSuiteDetail(null);
      return;
    }

    setExpandedSuiteId(suiteId);
    setLoadingDetail(true);

    try {
      const data = await apiClient.get<SuiteDetailResponse>(
        `/api/projects/${projectId}/test-suites/${suiteId}`,
      );
      setSuiteDetail(data);
    } catch {
      // Error handled by apiClient
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateSuite = async () => {
    if (!newSuiteName.trim()) return;
    setCreating(true);

    try {
      await apiClient.post(`/api/projects/${projectId}/test-suites`, {
        name: newSuiteName.trim(),
        description: newSuiteDescription.trim() || undefined,
      });
      setNewSuiteName('');
      setNewSuiteDescription('');
      setShowCreateModal(false);
      onRefresh();
    } catch {
      // Error handled by apiClient
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSuite = async (suiteId: string) => {
    if (!confirm('Delete this suite and all its test cases? This action cannot be undone.')) return;
    try {
      await apiClient.del(`/api/projects/${projectId}/test-suites/${suiteId}`);
      if (expandedSuiteId === suiteId) {
        setExpandedSuiteId(null);
        setSuiteDetail(null);
      }
      onRefresh();
    } catch { /* handled */ }
  };

  const handleRunTestCase = async (testCaseId: string) => {
    try {
      const data = await apiClient.post<{ test_run: { id: string } }>(
        `/api/projects/${projectId}/test-runs`,
        { test_case_id: testCaseId, mode: 'ai_driven', browser: 'chromium' },
      );
      router.push(`/dashboard/projects/${projectId}/runs/${data.test_run.id}`);
    } catch { /* handled */ }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Test Suites
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          New Suite
        </button>
      </div>

      {/* Empty state */}
      {rootSuites.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
          </div>
          <h3 className="font-semibold">No test suites yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-3">
            Create a test suite manually or use AI Generate to auto-create tests.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Create Suite
          </button>
        </div>
      )}

      {/* Suite list */}
      <div className="space-y-2">
        {rootSuites.map((suite) => {
          const isExpanded = expandedSuiteId === suite.id;
          const caseCount = suite.test_cases?.[0]?.count ?? 0;

          return (
            <div key={suite.id} className="rounded-lg border bg-card overflow-hidden shadow-sm">
              {/* Suite header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => toggleSuite(suite.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      'shrink-0 transition-transform duration-200',
                      isExpanded && 'rotate-90',
                    )}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{suite.name}</p>
                    {suite.description && (
                      <p className="text-xs text-muted-foreground truncate">{suite.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {caseCount} {caseCount === 1 ? 'case' : 'cases'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSuite(suite.id); }}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete suite"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              {/* Expanded: test cases list */}
              {isExpanded && (
                <div className="border-t bg-muted/30">
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
                    </div>
                  ) : suiteDetail?.test_cases && suiteDetail.test_cases.length > 0 ? (
                    <div className="divide-y">
                      {suiteDetail.test_cases.map((tc) => (
                        <div key={tc.id} className="flex items-center justify-between px-4 py-3 pl-10 hover:bg-accent/30 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{tc.title}</p>
                              {tc.is_ai_generated && (
                                <span className="shrink-0 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">AI</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                tc.priority === 'critical' ? 'bg-red-500/10 text-red-600' :
                                tc.priority === 'high' ? 'bg-orange-500/10 text-orange-600' :
                                tc.priority === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                                'bg-slate-500/10 text-slate-600'
                              )}>
                                {tc.priority}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {tc.steps?.length ?? 0} steps
                              </span>
                              {tc.tags?.map((tag) => (
                                <span key={tag} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRunTestCase(tc.id)}
                            className="shrink-0 ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            Run
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No test cases in this suite. Use AI Generate to add some!
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Create Suite Modal ─────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl mx-4">
            <h3 className="text-lg font-semibold">Create Test Suite</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Organize your test cases into logical suites.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Suite Name *</label>
                <input
                  type="text"
                  value={newSuiteName}
                  onChange={(e) => setNewSuiteName(e.target.value)}
                  placeholder="e.g. Authentication Tests"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={newSuiteDescription}
                  onChange={(e) => setNewSuiteDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSuite}
                disabled={creating || !newSuiteName.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Suite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
