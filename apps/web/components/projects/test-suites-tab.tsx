'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight, Trash2, FileText, Pencil } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast-error';
import { type GeneratedTestCase, type TestSuite, type TestCase } from '@qaforge/shared-types';
import { CaseDialog } from '@/components/projects/case-dialog';
import { CaseList } from '@/components/projects/case-list';
import { DraftSteps } from '@/components/projects/draft-steps';
import { SuiteDialog } from '@/components/projects/suite-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Spinner } from '@/components/shared/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function TestSuitesTab({ projectId, suites, onRefresh }: TestSuitesTabProps) {
  const router = useRouter();
  const isDemo = useDemoMode();
  const [expandedSuiteId, setExpandedSuiteId] = useState<string | null>(null);
  const [suiteDetail, setSuiteDetail] = useState<SuiteDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // The one action in flight, e.g. "run:<caseId>": its button shows a spinner and can't be pressed twice.
  const [busy, setBusy] = useState<string | null>(null);

  // Each dialog keeps its target after closing (so it can animate out); `nonce` remounts it with a clean form per open.
  const [suiteDialog, setSuiteDialog] = useState<{ editing: TestSuite | null; nonce: number } | null>(null);
  const [suiteDialogOpen, setSuiteDialogOpen] = useState(false);
  const [caseDialog, setCaseDialog] = useState<{ suiteId: string; editing: TestCase | null; nonce: number } | null>(null);
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);

  const openSuiteDialog = (suite?: TestSuite) => {
    setSuiteDialog((prev) => ({ editing: suite ?? null, nonce: (prev?.nonce ?? 0) + 1 }));
    setSuiteDialogOpen(true);
  };

  const openCaseDialog = (suiteId: string, tc?: TestCase) => {
    setCaseDialog((prev) => ({ suiteId, editing: tc ?? null, nonce: (prev?.nonce ?? 0) + 1 }));
    setCaseDialogOpen(true);
  };

  // AI Optimization state
  const [optimizingCaseId, setOptimizingCaseId] = useState<string | null>(null);
  // AI-2: an optimized case is a draft until the user applies it.
  const [optimizeReview, setOptimizeReview] = useState<{
    caseId: string;
    suiteId: string;
    draft: GeneratedTestCase;
  } | null>(null);
  const [applyingOptimize, setApplyingOptimize] = useState(false);

  // Root-level suites (no parent)
  const rootSuites = suites.filter((s) => !s.parent_suite_id);

  const loadSuite = (suiteId: string) =>
    apiClient.get<SuiteDetailResponse>(`/api/projects/${projectId}/test-suites/${suiteId}`);

  const toggleSuite = async (suiteId: string) => {
    if (expandedSuiteId === suiteId) {
      setExpandedSuiteId(null);
      setSuiteDetail(null);
      return;
    }

    setExpandedSuiteId(suiteId);
    setLoadingDetail(true);

    try {
      setSuiteDetail(await loadSuite(suiteId));
    } catch (err) {
      toastError('Could not load the test cases', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeleteCase = async (caseId: string, suiteId: string) => {
    if (!confirm('Delete this test case and its run history? This cannot be undone.')) return;
    setBusy(`delete-case:${caseId}`);
    try {
      await apiClient.del(`/api/projects/${projectId}/test-suites/${suiteId}/test-cases/${caseId}`);
      setSuiteDetail(await loadSuite(suiteId));
      onRefresh();
      toast.success('Test case deleted');
    } catch (err) {
      toastError('Could not delete the test case', err);
    } finally {
      setBusy(null);
    }
  };

  const handleOptimizeTestCase = async (caseId: string, suiteId: string) => {
    setOptimizingCaseId(caseId);

    // Demo is read-only: simulate the optimize pass with visible feedback.
    if (isDemo) {
      await sleep(1500);
      setSuiteDetail((prev) =>
        prev
          ? {
              ...prev,
              test_cases: prev.test_cases.map((tc) =>
                tc.id === caseId ? { ...tc, is_ai_generated: true } : tc,
              ),
            }
          : prev,
      );
      toast.success('Test case optimized', {
        description: 'Instructions and selectors refined into structured steps.',
      });
      setOptimizingCaseId(null);
      return;
    }

    try {
      const { draft } = await apiClient.post<{ draft: GeneratedTestCase }>(
        `/api/projects/${projectId}/ai/optimize/${caseId}`,
        {},
      );
      setOptimizeReview({ caseId, suiteId, draft });
    } catch (err) {
      toast.error('Could not optimize this test case', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setOptimizingCaseId(null);
    }
  };

  const handleApplyOptimize = async () => {
    if (!optimizeReview) return;
    setApplyingOptimize(true);
    try {
      await apiClient.post(
        `/api/projects/${projectId}/ai/optimize/${optimizeReview.caseId}/apply`,
        optimizeReview.draft,
      );
      setSuiteDetail(await loadSuite(optimizeReview.suiteId));
      setOptimizeReview(null);
      toast.success('Optimized test case saved');
    } catch (err) {
      toast.error('Could not save the optimized test case', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setApplyingOptimize(false);
    }
  };

  const handleDeleteSuite = async (suiteId: string) => {
    if (!confirm('Delete this suite and all its test cases? This action cannot be undone.')) return;
    setBusy(`delete-suite:${suiteId}`);
    try {
      await apiClient.del(`/api/projects/${projectId}/test-suites/${suiteId}`);
      if (expandedSuiteId === suiteId) {
        setExpandedSuiteId(null);
        setSuiteDetail(null);
      }
      onRefresh();
      toast.success('Suite deleted');
    } catch (err) {
      toastError('Could not delete the suite', err);
    } finally {
      setBusy(null);
    }
  };

  const handleRunTestCase = async (testCaseId: string) => {
    // Demo is read-only: open the matching seeded run, which the run view
    // replays live (step by step, with screenshots and a verdict).
    if (isDemo) {
      try {
        const data = await apiClient.get<{
          test_runs: { id: string; test_case_id: string | null }[];
        }>(`/api/projects/${projectId}/test-runs?page=1&per_page=50`);
        const runs = data.test_runs ?? [];
        const match = runs.find((r) => r.test_case_id === testCaseId) ?? runs[0];
        if (match) {
          router.push(`/dashboard/projects/${projectId}/runs/${match.id}`);
          return;
        }
      } catch {
        /* fall through to toast */
      }
      toast.info('Demo is read-only', {
        description: 'Sign up to launch real test runs against your own apps.',
      });
      return;
    }

    if (busy) return; // one start per click: no duplicate runs from a double click
    setBusy(`run:${testCaseId}`);
    try {
      const data = await apiClient.post<{ test_run: { id: string } }>(
        `/api/projects/${projectId}/test-runs`,
        { test_case_id: testCaseId, mode: 'ai_driven', browser: 'chromium' },
      );
      // keep the spinner until the run page takes over
      router.push(`/dashboard/projects/${projectId}/runs/${data.test_run.id}`);
    } catch (err) {
      toastError('Could not start the run', err);
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Test suites</h3>
        <Button variant="outline" size="sm" onClick={() => openSuiteDialog()}>
          <Plus />
          New suite
        </Button>
      </div>

      {/* Empty state */}
      {rootSuites.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No test suites yet"
          description="Create a suite manually, or use AI Generate to auto-create a suite full of cases."
          action={
            <Button onClick={() => openSuiteDialog()}>
              <Plus />
              Create suite
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rootSuites.map((suite) => {
            const isExpanded = expandedSuiteId === suite.id;
            const caseCount = suite.test_cases?.[0]?.count ?? 0;

            return (
              <div key={suite.id} className="overflow-hidden rounded-lg border bg-card">
                {/* Suite header */}
                <div className="flex items-center justify-between gap-2 pr-3">
                  <button
                    onClick={() => toggleSuite(suite.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40"
                  >
                    <ChevronRight
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                        isExpanded && 'rotate-90 text-primary',
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {suite.name}
                      </span>
                      {suite.description && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {suite.description}
                        </span>
                      )}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">
                      {caseCount} {caseCount === 1 ? 'case' : 'cases'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      onClick={() => openSuiteDialog(suite)}
                      aria-label={`Rename ${suite.name}`}
                      title="Rename suite"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteSuite(suite.id)}
                      disabled={busy === `delete-suite:${suite.id}`}
                      aria-label="Delete suite"
                      title="Delete suite"
                    >
                      {busy === `delete-suite:${suite.id}` ? <Spinner /> : <Trash2 className="size-4" />}
                    </Button>
                  </div>
                </div>

                {/* Expanded: test cases list */}
                {isExpanded && (
                  <div className="border-t border-border bg-secondary/30">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <span className="text-xs font-semibold text-muted-foreground">Test cases</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={() => openCaseDialog(suite.id)}
                      >
                        <Plus />
                        Add case
                      </Button>
                    </div>

                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-8">
                        <Spinner className="text-primary" />
                      </div>
                    ) : suiteDetail?.test_cases && suiteDetail.test_cases.length > 0 ? (
                      <CaseList
                        cases={suiteDetail.test_cases}
                        busy={busy}
                        optimizingCaseId={optimizingCaseId}
                        onEdit={(tc) => openCaseDialog(suite.id, tc)}
                        onDelete={(caseId) => handleDeleteCase(caseId, suite.id)}
                        onOptimize={(caseId) => handleOptimizeTestCase(caseId, suite.id)}
                        onRun={handleRunTestCase}
                      />
                    ) : (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No test cases in this suite yet. Add one manually or use AI Generate.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {suiteDialog && (
        <SuiteDialog
          key={suiteDialog.nonce}
          projectId={projectId}
          editing={suiteDialog.editing}
          open={suiteDialogOpen}
          onClose={() => setSuiteDialogOpen(false)}
          onSaved={onRefresh}
        />
      )}

      {caseDialog && (
        <CaseDialog
          key={caseDialog.nonce}
          projectId={projectId}
          suiteId={caseDialog.suiteId}
          editing={caseDialog.editing}
          open={caseDialogOpen}
          onClose={() => setCaseDialogOpen(false)}
          onSaved={async () => {
            setSuiteDetail(await loadSuite(caseDialog.suiteId));
            onRefresh();
          }}
        />
      )}

      {/* Review an AI-optimized case before it replaces the saved one (AI-2) */}
      <Dialog
        open={optimizeReview !== null}
        onOpenChange={(o) => {
          if (!o && !applyingOptimize) setOptimizeReview(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review the optimized test case</DialogTitle>
            <DialogDescription>
              Nothing has changed yet. Apply to replace the saved case with this version.
            </DialogDescription>
          </DialogHeader>
          {optimizeReview && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{optimizeReview.draft.title}</p>
                {optimizeReview.draft.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{optimizeReview.draft.description}</p>
                )}
              </div>
              <DraftSteps steps={optimizeReview.draft.steps} />
              {optimizeReview.draft.expected_result && (
                <p className="text-xs text-muted-foreground">
                  Expected: {optimizeReview.draft.expected_result}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOptimizeReview(null)}
              disabled={applyingOptimize}
            >
              Discard
            </Button>
            <Button type="button" onClick={handleApplyOptimize} disabled={applyingOptimize}>
              {applyingOptimize && <Spinner className="text-primary-foreground" />}
              {applyingOptimize ? 'Saving…' : 'Apply changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
