'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  ChevronRight,
  Trash2,
  Sparkles,
  Play,
  FileText,
  ListChecks,
  Pencil,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast-error';
import { type GeneratedTestCase, type StepAction, type TestSuite, type TestCase } from '@qaforge/shared-types';
import { DraftSteps } from '@/components/projects/draft-steps';
import {
  StepRow,
  isBlankStep,
  newDraftStep,
  stepErrors,
  toSavedStep,
  type DraftStep,
  type StepErrors,
} from '@/components/projects/step-row';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/shared/status-badge';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSuiteName, setNewSuiteName] = useState('');
  // Set when the suite dialog renames an existing suite instead of creating one.
  const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null);
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
  const [caseSteps, setCaseSteps] = useState<DraftStep[]>([newDraftStep()]);
  // Per-step field errors, shown next to the fields after a save attempt (null = not checked yet).
  const [caseStepErrors, setCaseStepErrors] = useState<StepErrors[] | null>(null);
  // Set when the case dialog edits an existing case instead of creating one (UI-2).
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);

  const resetCaseForm = () => {
    setEditingCaseId(null);
    setCaseTitle('');
    setCaseDescription('');
    setCaseExpected('');
    setCasePriority('medium');
    setCaseType('functional');
    setCaseSteps([newDraftStep()]);
    setCaseStepErrors(null);
  };

  const openNewCase = (suiteId: string) => {
    resetCaseForm();
    setSelectedSuiteForNewCase(suiteId);
    setShowCreateCaseModal(true);
  };

  const openEditCase = (tc: TestCase, suiteId: string) => {
    setEditingCaseId(tc.id);
    setSelectedSuiteForNewCase(suiteId);
    setCaseTitle(tc.title);
    setCaseDescription(tc.description ?? '');
    setCaseExpected(tc.expected_result ?? '');
    setCasePriority((tc.priority as 'critical' | 'high' | 'medium' | 'low') ?? 'medium');
    setCaseType(tc.type ?? 'functional');
    const steps = (tc.steps ?? []) as { action?: string; instruction?: string; selector?: string; value?: string }[];
    setCaseSteps(
      steps.length
        ? steps.map((s) => ({
            // Legacy rows without an action open with none chosen, so the editor asks instead of guessing.
            action: (s.action as StepAction | undefined) ?? '',
            instruction: s.instruction ?? '',
            selector: s.selector ?? '',
            value: s.value ?? '',
          }))
        : [newDraftStep()],
    );
    setShowCreateCaseModal(true);
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
    } catch (err) {
      toastError('Could not load the test cases', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const openSuiteDialog = (suite?: TestSuite) => {
    setEditingSuiteId(suite?.id ?? null);
    setNewSuiteName(suite?.name ?? '');
    setNewSuiteDescription(suite?.description ?? '');
    setShowCreateModal(true);
  };

  const handleCreateSuite = async () => {
    if (!newSuiteName.trim()) return;
    setCreating(true);

    try {
      if (editingSuiteId) {
        await apiClient.put(`/api/projects/${projectId}/test-suites/${editingSuiteId}`, {
          name: newSuiteName.trim(),
          description: newSuiteDescription.trim() || null,
        });
        toast.success('Suite saved');
      } else {
        await apiClient.post(`/api/projects/${projectId}/test-suites`, {
          name: newSuiteName.trim(),
          description: newSuiteDescription.trim() || undefined,
        });
        toast.success('Suite created');
      }
      setNewSuiteName('');
      setNewSuiteDescription('');
      setShowCreateModal(false);
      onRefresh();
    } catch (err) {
      toastError(editingSuiteId ? 'Could not save the suite' : 'Could not create the suite', err);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTestCase = async () => {
    if (!caseTitle.trim() || !selectedSuiteForNewCase) return;

    // Check every step here first (same schema as the API) and show what's missing next to the field.
    const steps = caseSteps.filter((s) => !isBlankStep(s));
    if (!steps.length) {
      toast.error('Add at least one step');
      return;
    }
    const errors = caseSteps.map((s) => (isBlankStep(s) ? {} : stepErrors(s)));
    setCaseStepErrors(errors);
    const invalid = errors.filter((e) => Object.keys(e).length).length;
    if (invalid) {
      toast.error(`${invalid} step${invalid === 1 ? ' needs' : 's need'} a fix`, {
        description: 'The missing parts are marked in red below each step.',
      });
      return;
    }

    setCreatingCase(true);
    try {
      // Fields the action doesn't use are dropped; the API validates the rest (shared schema).
      const formattedSteps = steps.map((s, idx) => toSavedStep(s, idx + 1));

      const casesPath = `/api/projects/${projectId}/test-suites/${selectedSuiteForNewCase}/test-cases`;
      const body = {
        title: caseTitle.trim(),
        // null clears the field on edit; create leaves it out
        description: caseDescription.trim() || (editingCaseId ? null : undefined),
        expected_result: caseExpected.trim() || (editingCaseId ? null : undefined),
        priority: casePriority,
        type: caseType,
        steps: formattedSteps,
      };
      if (editingCaseId) await apiClient.put(`${casesPath}/${editingCaseId}`, body);
      else await apiClient.post(casesPath, body);
      toast.success(editingCaseId ? 'Test case saved' : 'Test case created');

      resetCaseForm();
      setShowCreateCaseModal(false);

      // Reload detail
      const data = await apiClient.get<SuiteDetailResponse>(
        `/api/projects/${projectId}/test-suites/${selectedSuiteForNewCase}`,
      );
      setSuiteDetail(data);
      onRefresh();
    } catch (err) {
      // e.g. the step contract's field-level message ("steps.1.value: …")
      toast.error('Could not save the test case', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setCreatingCase(false);
    }
  };

  const handleDeleteCase = async (caseId: string, suiteId: string) => {
    if (!confirm('Delete this test case and its run history? This cannot be undone.')) return;
    setBusy(`delete-case:${caseId}`);
    try {
      await apiClient.del(`/api/projects/${projectId}/test-suites/${suiteId}/test-cases/${caseId}`);
      const data = await apiClient.get<SuiteDetailResponse>(`/api/projects/${projectId}/test-suites/${suiteId}`);
      setSuiteDetail(data);
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
      const data = await apiClient.get<SuiteDetailResponse>(
        `/api/projects/${projectId}/test-suites/${optimizeReview.suiteId}`,
      );
      setSuiteDetail(data);
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
                        onClick={() => openNewCase(suite.id)}
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
                      <ul className="divide-y divide-border">
                        {suiteDetail.test_cases.map((tc) => (
                          <li
                            key={tc.id}
                            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {tc.title}
                                </p>
                                {tc.is_ai_generated && (
                                  <Badge variant="default" className="shrink-0">
                                    <Sparkles />
                                    AI optimized
                                  </Badge>
                                )}
                              </div>
                              {tc.description && (
                                <p className="mt-1 line-clamp-1 max-w-xl text-xs text-muted-foreground">
                                  {tc.description}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <SeverityBadge severity={tc.priority} />
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <ListChecks className="size-3.5" />
                                  {tc.steps?.length ?? 0} steps
                                </span>
                                {tc.tags?.map((tag) => (
                                  <Badge key={tag} variant="secondary">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditCase(tc, suite.id)}
                                aria-label={`Edit ${tc.title}`}
                                title="Edit steps"
                              >
                                <Pencil />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDeleteCase(tc.id, suite.id)}
                                disabled={busy === `delete-case:${tc.id}`}
                                aria-label={`Delete ${tc.title}`}
                                title="Delete test case"
                              >
                                {busy === `delete-case:${tc.id}` ? <Spinner /> : <Trash2 />}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOptimizeTestCase(tc.id, suite.id)}
                                disabled={optimizingCaseId === tc.id}
                                title="Rewrite the steps more clearly with AI (you review before saving)"
                              >
                                {optimizingCaseId === tc.id ? <Spinner /> : <Sparkles />}
                                Optimize
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleRunTestCase(tc.id)}
                                disabled={busy?.startsWith('run:')}
                              >
                                {busy === `run:${tc.id}` ? <Spinner className="text-primary-foreground" /> : <Play />}
                                {busy === `run:${tc.id}` ? 'Starting…' : 'Run'}
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
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

      {/* ── Create Suite Modal ─────────────────────────────────────────────── */}
      <Dialog
        open={showCreateModal}
        onOpenChange={(o) => {
          if (!o) setShowCreateModal(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSuiteId ? 'Rename test suite' : 'Create test suite'}</DialogTitle>
            <DialogDescription>Organize your test cases into logical suites.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="suite-name">
                Suite name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="suite-name"
                value={newSuiteName}
                onChange={(e) => setNewSuiteName(e.target.value)}
                placeholder="e.g. Authentication tests"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suite-description">Description</Label>
              <Textarea
                id="suite-description"
                value={newSuiteDescription}
                onChange={(e) => setNewSuiteDescription(e.target.value)}
                placeholder="Optional description…"
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateSuite} disabled={creating || !newSuiteName.trim()}>
              {creating && <Spinner className="text-primary-foreground" />}
              {creating ? 'Saving…' : editingSuiteId ? 'Save changes' : 'Create suite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Test Case Modal ─────────────────────────────────────────── */}
      <Dialog
        open={showCreateCaseModal}
        onOpenChange={(o) => {
          if (!o) setShowCreateCaseModal(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingCaseId ? 'Edit test case' : 'Create test case'}</DialogTitle>
            <DialogDescription>
              Write each step the way you would tell a colleague, such as Click &quot;Sign in&quot;. Elements are found
              by the words on the page, so no selectors are needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="case-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="case-title"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                placeholder="e.g. Successful login with valid password"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="case-priority">Priority</Label>
                <Select
                  value={casePriority}
                  onValueChange={(v) =>
                    setCasePriority(v as 'critical' | 'high' | 'medium' | 'low')
                  }
                >
                  <SelectTrigger id="case-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="case-type">Type</Label>
                <Select value={caseType} onValueChange={setCaseType}>
                  <SelectTrigger id="case-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="functional">Functional</SelectItem>
                    <SelectItem value="smoke">Smoke</SelectItem>
                    <SelectItem value="regression">Regression</SelectItem>
                    <SelectItem value="edge_case">Edge case</SelectItem>
                    <SelectItem value="accessibility">Accessibility</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="case-description">Description</Label>
              <Textarea
                id="case-description"
                value={caseDescription}
                onChange={(e) => setCaseDescription(e.target.value)}
                placeholder="What is the objective of this test case?"
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="case-expected">Expected result</Label>
              <Input
                id="case-expected"
                value={caseExpected}
                onChange={(e) => setCaseExpected(e.target.value)}
                placeholder="e.g. User lands on the projects dashboard"
              />
            </div>

            {/* Dynamic steps */}
            <div className="space-y-2">
              <Label>Steps</Label>
              <p className="text-xs text-muted-foreground">
                Examples: Open /login · Type &quot;ada@example.com&quot; into Email · Click &quot;Sign in&quot; · Check page
                address contains /dashboard · Check &quot;Welcome&quot; is shown
              </p>
              <div className="space-y-2">
                {caseSteps.map((step, idx) => (
                  <StepRow
                    key={idx}
                    index={idx}
                    step={step}
                    // Once a save was attempted, errors follow edits live so a fix clears its message.
                    errors={caseStepErrors ? (isBlankStep(step) ? {} : stepErrors(step)) : undefined}
                    onChange={(next) => setCaseSteps(caseSteps.map((s, i) => (i === idx ? next : s)))}
                    onRemove={
                      caseSteps.length > 1 ? () => setCaseSteps(caseSteps.filter((_, i) => i !== idx)) : undefined
                    }
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => setCaseSteps([...caseSteps, newDraftStep()])}
              >
                <Plus />
                Add step
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateCaseModal(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateTestCase}
              disabled={creatingCase || !caseTitle.trim()}
            >
              {creatingCase && <Spinner className="text-primary-foreground" />}
              {creatingCase ? 'Saving…' : editingCaseId ? 'Save changes' : 'Create case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
