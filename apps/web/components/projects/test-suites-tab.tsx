'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  ChevronRight,
  Trash2,
  Sparkles,
  Play,
  X,
  FileText,
  ListChecks,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toast } from 'sonner';
import type { TestSuite, TestCase } from '@qaforge/shared-types';
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
    } catch {
      /* handled */
    } finally {
      setCreatingCase(false);
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
      await apiClient.post(`/api/projects/${projectId}/ai/optimize/${caseId}`, {});

      // Reload detail
      const data = await apiClient.get<SuiteDetailResponse>(
        `/api/projects/${projectId}/test-suites/${suiteId}`,
      );
      setSuiteDetail(data);
    } catch {
      /* handled */
    } finally {
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
    } catch {
      /* handled */
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

    try {
      const data = await apiClient.post<{ test_run: { id: string } }>(
        `/api/projects/${projectId}/test-runs`,
        { test_case_id: testCaseId, mode: 'ai_driven', browser: 'chromium' },
      );
      router.push(`/dashboard/projects/${projectId}/runs/${data.test_run.id}`);
    } catch {
      /* handled */
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Test suites</h3>
        <Button variant="outline" size="sm" onClick={() => setShowCreateModal(true)}>
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
            <Button onClick={() => setShowCreateModal(true)}>
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
                      className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteSuite(suite.id)}
                      aria-label="Delete suite"
                      title="Delete suite"
                    >
                      <Trash2 className="size-4" />
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
                        onClick={() => {
                          setSelectedSuiteForNewCase(suite.id);
                          setShowCreateCaseModal(true);
                        }}
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
                                variant="outline"
                                size="sm"
                                onClick={() => handleOptimizeTestCase(tc.id, suite.id)}
                                disabled={optimizingCaseId === tc.id}
                                title="Optimize instructions & selectors with AI"
                              >
                                {optimizingCaseId === tc.id ? <Spinner /> : <Sparkles />}
                                Optimize
                              </Button>
                              <Button size="sm" onClick={() => handleRunTestCase(tc.id)}>
                                <Play />
                                Run
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
            <DialogTitle>Create test suite</DialogTitle>
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
              {creating ? 'Creating…' : 'Create suite'}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create test case</DialogTitle>
            <DialogDescription>
              Add a manual case. You can optimize it into structured, selector-rich steps with AI later.
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
              <div className="space-y-2">
                {caseSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 select-none font-mono text-xs text-muted-foreground">
                      {idx + 1}.
                    </span>
                    <Input
                      value={step}
                      onChange={(e) => {
                        const newSteps = [...caseSteps];
                        newSteps[idx] = e.target.value;
                        setCaseSteps(newSteps);
                      }}
                      placeholder={`Step ${idx + 1} instruction…`}
                    />
                    {caseSteps.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setCaseSteps(caseSteps.filter((_, i) => i !== idx))}
                        aria-label={`Remove step ${idx + 1}`}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => setCaseSteps([...caseSteps, ''])}
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
              {creatingCase ? 'Creating…' : 'Create case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
