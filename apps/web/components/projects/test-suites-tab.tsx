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

  // Manual Test Case creation states
  const [showCreateCaseModal, setShowCreateCaseModal] = useState(false);
  const [selectedSuiteForNewCase, setSelectedSuiteForNewCase] = useState<string | null>(null);
  const [creatingCase, setCreatingCase] = useState(false);
  const [caseTitle, setCaseTitle] = useState('');
  const [caseDescription, setCaseDescription] = useState('');
  const [caseExpected, setCaseExpected] = useState('');
  const [casePriority, setCasePriority] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [caseType, setCaseType] = useState<string>('functional');
  const [caseSteps, setCaseSteps] = useState<string[]>(['']);
  
  // AI Optimization state
  const [optimizingCaseId, setOptimizingCaseId] = useState<string | null>(null);

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

  const handleCreateTestCase = async () => {
    if (!caseTitle.trim() || !selectedSuiteForNewCase) return;
    setCreatingCase(true);

    try {
      const formattedSteps = caseSteps
        .filter((s) => s.trim())
        .map((step, idx) => ({
          step_number: idx + 1,
          instruction: step.trim(),
        }));

      await apiClient.post(
        `/api/projects/${projectId}/test-suites/${selectedSuiteForNewCase}/test-cases`,
        {
          title: caseTitle.trim(),
          description: caseDescription.trim() || undefined,
          expected_result: caseExpected.trim() || undefined,
          priority: casePriority,
          type: caseType,
          steps: formattedSteps,
        },
      );

      // Reset
      setCaseTitle('');
      setCaseDescription('');
      setCaseExpected('');
      setCasePriority('medium');
      setCaseType('functional');
      setCaseSteps(['']);
      setShowCreateCaseModal(false);
      
      // Reload detail
      const data = await apiClient.get<SuiteDetailResponse>(
        `/api/projects/${projectId}/test-suites/${selectedSuiteForNewCase}`,
      );
      setSuiteDetail(data);
      onRefresh();
    } catch { /* handled */ } finally {
      setCreatingCase(false);
    }
  };

  const handleOptimizeTestCase = async (caseId: string, suiteId: string) => {
    setOptimizingCaseId(caseId);

    try {
      await apiClient.post(`/api/projects/${projectId}/ai/optimize/${caseId}`, {});
      
      // Reload detail
      const data = await apiClient.get<SuiteDetailResponse>(
        `/api/projects/${projectId}/test-suites/${suiteId}`,
      );
      setSuiteDetail(data);
    } catch { /* handled */ } finally {
      setOptimizingCaseId(null);
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
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 shadow-sm hover:border-white/[0.15] active:scale-95 transition-all duration-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          New Suite
        </button>
      </div>

      {/* Empty state */}
      {rootSuites.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-slate-900/10 backdrop-blur-md p-10 text-center animate-in fade-in duration-300">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 text-violet-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
          </div>
          <h3 className="font-bold text-slate-200 text-lg">No test suites yet</h3>
          <p className="text-sm text-slate-400 mt-1.5 mb-5 max-w-sm mx-auto">
            Create a test suite manually or use AI Generate to auto-create tests.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 hover:bg-violet-500 active:scale-95 transition-all duration-300"
          >
            Create Suite
          </button>
        </div>
      )}

      {/* Suite list */}
      <div className="space-y-3">
        {rootSuites.map((suite) => {
          const isExpanded = expandedSuiteId === suite.id;
          const caseCount = suite.test_cases?.[0]?.count ?? 0;

          return (
            <div key={suite.id} className="rounded-xl border border-white/[0.06] bg-slate-900/20 backdrop-blur-md overflow-hidden shadow-lg transition-all duration-300 hover:border-white/[0.12] hover:bg-slate-900/30">
              {/* Suite header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => toggleSuite(suite.id)}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      'shrink-0 transition-transform duration-200 text-slate-400',
                      isExpanded && 'rotate-90 text-violet-400',
                    )}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100 text-sm md:text-base truncate">{suite.name}</p>
                    {suite.description && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{suite.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="rounded-full bg-white/[0.04] border border-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                    {caseCount} {caseCount === 1 ? 'case' : 'cases'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSuite(suite.id); }}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete suite"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              {/* Expanded: test cases list */}
              {isExpanded && (
                <div className="border-t bg-slate-900/10 backdrop-blur-sm">
                  {/* Expanded Header with Add Case action */}
                  <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/[0.04] bg-white/[0.02]">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Test Cases</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSuiteForNewCase(suite.id);
                        setShowCreateCaseModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/10 border border-violet-500/25 px-2.5 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-600/20 active:scale-95 transition-all duration-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                      Add Case
                    </button>
                  </div>

                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-violet-500 border-t-transparent" />
                    </div>
                  ) : suiteDetail?.test_cases && suiteDetail.test_cases.length > 0 ? (
                    <div className="divide-y divide-white/[0.04]">
                      {suiteDetail.test_cases.map((tc) => (
                        <div key={tc.id} className="flex items-center justify-between px-6 py-4 pl-10 hover:bg-white/[0.02] transition-all duration-200">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-200 truncate">{tc.title}</p>
                              {tc.is_ai_generated && (
                                <span className="shrink-0 rounded-md bg-gradient-to-r from-violet-500/20 to-indigo-500/20 border border-violet-500/30 px-2 py-0.5 text-[9px] font-bold text-violet-300 uppercase tracking-wider">AI Optimized</span>
                              )}
                            </div>
                            {tc.description && (
                              <p className="text-xs text-slate-400 mt-1 max-w-xl line-clamp-1">{tc.description}</p>
                            )}
                            <div className="flex items-center gap-2.5 mt-2">
                              <span className={cn(
                                'rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border',
                                tc.priority === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                tc.priority === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                tc.priority === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                'bg-slate-500/10 text-slate-400 border-slate-500/20'
                              )}>
                                {tc.priority}
                              </span>
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                                {tc.steps?.length ?? 0} steps
                              </span>
                              {tc.tags?.map((tag) => (
                                <span key={tag} className="rounded bg-slate-800/60 border border-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0 ml-4">
                            {/* AI Optimize Button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleOptimizeTestCase(tc.id, suite.id); }}
                              disabled={optimizingCaseId === tc.id}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border border-violet-500/30 px-3.5 py-1.5 text-xs font-bold text-violet-300 hover:text-white hover:from-violet-600 hover:to-indigo-600 transition-all duration-300 disabled:opacity-50 active:scale-95 shadow-sm shadow-violet-500/5"
                              title="Optimize instructions & selectors with AI"
                            >
                              {optimizingCaseId === tc.id ? (
                                <svg className="animate-spin h-3.5 w-3.5 text-violet-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3v3m6.36-.64-2.12 2.12M21 12h-3M18.36 18.36l-2.12-2.12M12 21v-3M5.64 18.36l2.12-2.12M3 12h3M5.64 5.64l2.12 2.12"/></svg>
                              )}
                              Optimize
                            </button>

                            {/* Run Button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRunTestCase(tc.id); }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/10 transition-all duration-300 hover:bg-emerald-500 active:scale-95"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              Run
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-slate-400 border-t border-white/[0.04]">
                      No test cases in this suite. Create a case manually or use AI Generate to start!
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0d0e15]/95 p-8 backdrop-blur-xl shadow-2xl shadow-violet-500/5 mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Pulsating top gradient bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />

            <h3 className="text-xl font-bold bg-gradient-to-r from-slate-50 to-slate-200 bg-clip-text text-transparent">Create Test Suite</h3>
            <p className="text-sm text-slate-400 mt-1.5 mb-6">
              Organize your test cases into logical suites.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Suite Name *</label>
                <input
                  type="text"
                  value={newSuiteName}
                  onChange={(e) => setNewSuiteName(e.target.value)}
                  placeholder="e.g. Authentication Tests"
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 placeholder:text-slate-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</label>
                <textarea
                  value={newSuiteDescription}
                  onChange={(e) => setNewSuiteDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 placeholder:text-slate-500 resize-none"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.03] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSuite}
                disabled={creating || !newSuiteName.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
              >
                {creating ? 'Creating...' : 'Create Suite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Test Case Modal ─────────────────────────────────────────── */}
      {showCreateCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0d0e15]/95 p-8 backdrop-blur-xl shadow-2xl shadow-violet-500/5 mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Pulsating top gradient bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
            
            <h3 className="text-xl font-bold bg-gradient-to-r from-slate-50 to-slate-200 bg-clip-text text-transparent">Create Test Case</h3>
            <p className="text-sm text-slate-400 mt-1.5 mb-6">
              Add a manual test case. You can optimize it into structured, selector-rich steps with AI later!
            </p>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Test Title *</label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  placeholder="e.g. Successful Login with Valid Password"
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 placeholder:text-slate-500"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Priority</label>
                  <select
                    value={casePriority}
                    onChange={(e) => setCasePriority(e.target.value as 'critical' | 'high' | 'medium' | 'low')}
                    className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Type</label>
                  <select
                    value={caseType}
                    onChange={(e) => setCaseType(e.target.value)}
                    className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100"
                  >
                    <option value="functional">Functional</option>
                    <option value="smoke">Smoke</option>
                    <option value="regression">Regression</option>
                    <option value="edge_case">Edge Case</option>
                    <option value="accessibility">Accessibility</option>
                    <option value="negative">Negative</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</label>
                <textarea
                  value={caseDescription}
                  onChange={(e) => setCaseDescription(e.target.value)}
                  placeholder="What is the objective of this test case?"
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 placeholder:text-slate-500 resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Expected Result</label>
                <input
                  type="text"
                  value={caseExpected}
                  onChange={(e) => setCaseExpected(e.target.value)}
                  placeholder="e.g. User should land on projects grid dashboard"
                  className="w-full rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              {/* Dynamic steps input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Steps</label>
                <div className="space-y-2.5">
                  {caseSteps.map((step, idx) => (
                    <div key={idx} className="flex gap-2.5 items-center">
                      <span className="text-xs font-mono text-slate-500 w-4 select-none">{idx + 1}.</span>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => {
                          const newSteps = [...caseSteps];
                          newSteps[idx] = e.target.value;
                          setCaseSteps(newSteps);
                        }}
                        placeholder={`Step ${idx + 1} instruction...`}
                        className="flex-1 rounded-xl border bg-slate-950/60 border-white/[0.08] px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-100 placeholder:text-slate-500"
                      />
                      {caseSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCaseSteps(caseSteps.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                          title="Delete step"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                
                <button
                  type="button"
                  onClick={() => setCaseSteps([...caseSteps, ''])}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-bold transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                  Add Next Step
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowCreateCaseModal(false)}
                className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.03] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTestCase}
                disabled={creatingCase || !caseTitle.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
              >
                {creatingCase ? 'Creating...' : 'Create Case'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
