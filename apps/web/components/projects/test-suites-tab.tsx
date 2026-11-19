'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronRight, Download, FileCode, FileSpreadsheet, Trash2, FileText, Pencil, Play, Search } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api/client';
import { cn, downloadText, fileSlug } from '@/lib/utils';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import { toast } from 'sonner';
import { toastError } from '@/lib/toast-error';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { casesToCsv, suiteToPlaywright, type GeneratedTestCase, type TestSuite, type TestCase } from '@qaforge/shared-types';
import { CaseDialog } from '@/components/projects/case-dialog';
import { CaseList } from '@/components/projects/case-list';
import type { CaseResult } from '@/components/projects/project-overview-tab';
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
  /** F5: each case's last finished run, by case id */
  lastResults?: Record<string, CaseResult>;
  /** F11: the project's base URL, written into an exported Playwright file */
  baseUrl?: string;
  onRefresh: () => void;
}

/** A search hit: the case plus the name of the suite it lives in. */
type FoundCase = TestCase & { suite_name: string };

interface SuiteDetailResponse {
  suite: TestSuite;
  child_suites: TestSuite[];
  test_cases: TestCase[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** G4: what "Run suite" will run, counted before starting; a parent's run includes its sub-suites. */
function runSuiteTitle(own: number, inSubSuites: number, subSuites: number): string {
  if (own + inSubSuites === 0) return 'Add a test case first';
  if (inSubSuites === 0) return 'Run every test case in this suite, one after another';
  const where = `in its sub-suite${subSuites === 1 ? '' : 's'}`;
  return own === 0
    ? `Run the ${inSubSuites} test ${inSubSuites === 1 ? 'case' : 'cases'} ${where}, one after another`
    : `Run all ${own + inSubSuites} test cases, including ${inSubSuites} ${where}, one after another`;
}

export function TestSuitesTab({ projectId, suites, lastResults, baseUrl, onRefresh }: TestSuitesTabProps) {
  const ask = useConfirm();
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

  // Root-level suites (no parent), each followed by its sub-suites (G4: one level deep, made by the API or the seed).
  // "Run suite" on a parent runs its own cases, then each sub-suite's (G4); a sub-suite can also run on its own.
  const rootSuites = suites.filter((s) => !s.parent_suite_id);
  const shownSuites = rootSuites.flatMap((root) => [root, ...suites.filter((s) => s.parent_suite_id === root.id)]);

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

  // U3: a run page's "Edit the test case" links here with ?suite=…&edit=…: open that suite and the editor.
  // The query is cleared at once, so a reload or a return to this tab (which remounts it) does not reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const suiteId = params.get('suite');
    const caseId = params.get('edit');
    if (!suiteId || !caseId) return;
    window.history.replaceState(null, '', window.location.pathname);
    setExpandedSuiteId(suiteId);
    setLoadingDetail(true);
    loadSuite(suiteId)
      .then((detail) => {
        setSuiteDetail(detail);
        const tc = detail.test_cases.find((c) => c.id === caseId);
        if (tc) openCaseDialog(suiteId, tc);
        else toast.error('That test case no longer exists');
      })
      .catch((err) => toastError('Could not open the test case', err))
      .finally(() => setLoadingDetail(false));
  }, []); // only on arrival

  // F6: search test cases across every suite. `results` is null while the box is empty (the suites show instead).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundCase[] | null>(null);
  const [searching, setSearching] = useState(false);
  const runSearch = useCallback(
    async (q: string) => {
      const data = await apiClient.get<{ test_cases: FoundCase[] }>(
        `/api/projects/${projectId}/test-suites/search?q=${encodeURIComponent(q)}`,
      );
      setResults(data.test_cases ?? []);
    },
    [projectId],
  );
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let stale = false;
    setSearching(true);
    // wait for a pause in typing, and ignore an answer that arrives after a newer search began
    const timer = setTimeout(async () => {
      try {
        const data = await apiClient.get<{ test_cases: FoundCase[] }>(
          `/api/projects/${projectId}/test-suites/search?q=${encodeURIComponent(q)}`,
        );
        if (!stale) setResults(data.test_cases ?? []);
      } catch (err) {
        if (!stale) toastError('Could not search the test cases', err);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, projectId]);

  /** After a case changed: reload what is on screen (the open suite, the search results) and the suite counts. */
  const reload = async (...suiteIds: string[]) => {
    if (expandedSuiteId && suiteIds.includes(expandedSuiteId)) setSuiteDetail(await loadSuite(expandedSuiteId));
    if (query.trim()) await runSearch(query.trim());
    onRefresh();
  };
  const suiteOf = (caseId: string) => results?.find((c) => c.id === caseId)?.suite_id ?? '';

  const handleDuplicateCase = async (tc: TestCase) => {
    setBusy(`organise:${tc.id}`);
    try {
      await apiClient.post(`/api/projects/${projectId}/test-suites/${tc.suite_id}/test-cases/${tc.id}/duplicate`, {});
      await reload(tc.suite_id);
      toast.success('Test case duplicated', { description: `"${tc.title} (copy)" was added to the same suite.` });
    } catch (err) {
      toastError('Could not duplicate the test case', err);
    } finally {
      setBusy(null);
    }
  };

  const handleMoveCase = async (tc: TestCase, toSuiteId: string) => {
    setBusy(`organise:${tc.id}`);
    try {
      await apiClient.put(`/api/projects/${projectId}/test-suites/${tc.suite_id}/test-cases/${tc.id}`, { suite_id: toSuiteId });
      await reload(tc.suite_id, toSuiteId);
      toast.success(`Moved to ${suites.find((s) => s.id === toSuiteId)?.name ?? 'the suite'}`);
    } catch (err) {
      toastError('Could not move the test case', err);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteCase = async (caseId: string, suiteId: string) => {
    const yes = await ask({
      title: 'Delete this test case?',
      description: 'Its run history is deleted too. This cannot be undone.',
      confirmLabel: 'Delete test case',
      destructive: true,
    });
    if (!yes) return;
    setBusy(`delete-case:${caseId}`);
    try {
      await apiClient.del(`/api/projects/${projectId}/test-suites/${suiteId}/test-cases/${caseId}`);
      await reload(suiteId);
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
      await reload(optimizeReview.suiteId);
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
    const yes = await ask({
      title: 'Delete this suite?',
      description: 'All its test cases are deleted too. This cannot be undone.',
      confirmLabel: 'Delete suite',
      destructive: true,
    });
    if (!yes) return;
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

  // F11: download every case of the suite. Built in the browser from the saved cases; steps keep {{NAME}},
  // so no variable value ends up in the file.
  const handleExportSuite = async (suite: TestSuite, kind: 'playwright' | 'csv') => {
    setBusy(`export:${suite.id}`);
    try {
      const { test_cases: cases } = await loadSuite(suite.id);
      const name = `${fileSlug(suite.name)}-${new Date().toISOString().slice(0, 10)}`;
      if (kind === 'playwright') downloadText(`${name}.spec.ts`, suiteToPlaywright(cases, baseUrl), 'text/typescript');
      else downloadText(`${name}.csv`, String.fromCharCode(0xfeff) + casesToCsv(cases), 'text/csv;charset=utf-8'); // the mark makes Excel read accents right
      toast.success(`Exported ${cases.length} test ${cases.length === 1 ? 'case' : 'cases'}`);
    } catch (err) {
      toastError('Could not export the suite', err);
    } finally {
      setBusy(null);
    }
  };

  // F3: queue every case of the suite and open the suite run's page.
  const handleRunSuite = async (suiteId: string) => {
    if (isDemo) {
      toast.info('Demo is read-only', {
        description: 'Sign up to run whole suites against your own apps.',
      });
      return;
    }
    if (busy) return;
    setBusy(`run-suite:${suiteId}`);
    try {
      const data = await apiClient.post<{ batch: { id: string } }>(`/api/projects/${projectId}/run-batches`, {
        suite_id: suiteId,
      });
      // keep the spinner until the suite run page takes over
      router.push(`/dashboard/projects/${projectId}/batches/${data.batch.id}`);
    } catch (err) {
      toastError('Could not start the suite run', err);
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

      {rootSuites.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search test cases by title or step"
            aria-label="Search test cases"
            maxLength={100}
            className="pl-9"
          />
        </div>
      )}

      {/* Search results replace the suites while the box has text */}
      {query.trim() ? (
        <div className="overflow-hidden rounded-lg border bg-card" aria-live="polite">
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground">
            {results === null
              ? 'Searching…'
              : `${results.length} test ${results.length === 1 ? 'case matches' : 'cases match'}${results.length === 50 ? ' (first 50 shown)' : ''}`}
            {searching && results !== null && <Spinner className="ml-2 inline size-3" />}
          </p>
          {results && results.length > 0 && (
            <CaseList
              projectId={projectId}
              lastResults={lastResults}
              cases={results}
              moveTargets={suites}
              busy={busy}
              optimizingCaseId={optimizingCaseId}
              onEdit={(tc) => openCaseDialog(tc.suite_id, tc)}
              onDelete={(caseId) => handleDeleteCase(caseId, suiteOf(caseId))}
              onOptimize={(caseId) => handleOptimizeTestCase(caseId, suiteOf(caseId))}
              onDuplicate={handleDuplicateCase}
              onMove={handleMoveCase}
              onRun={handleRunTestCase}
            />
          )}
          {results?.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No test case has that in its title or steps.
            </p>
          )}
        </div>
      ) : rootSuites.length === 0 ? (
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
          {shownSuites.map((suite) => {
            const isExpanded = expandedSuiteId === suite.id;
            const caseCount = suite.test_cases?.[0]?.count ?? 0;
            const parent = rootSuites.find((r) => r.id === suite.parent_suite_id);
            const children = suites.filter((s) => s.parent_suite_id === suite.id);
            const inSubSuites = children.reduce((n, s) => n + (s.test_cases?.[0]?.count ?? 0), 0);

            return (
              <div key={suite.id} className={cn('overflow-hidden rounded-lg border bg-card', parent && 'ml-4 sm:ml-8')}>
                {/* Suite header */}
                {/* on a phone the name gets its own row and the controls sit under it */}
                <div className="flex flex-wrap items-center justify-between gap-x-2 sm:flex-nowrap sm:pr-3">
                  <button
                    onClick={() => toggleSuite(suite.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 basis-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 sm:basis-auto"
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
                      {parent && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">Inside {parent.name}</span>
                      )}
                      {suite.description && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {suite.description}
                        </span>
                      )}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-2 pb-3 pl-4 sm:pb-0 sm:pl-0">
                    <Badge variant="secondary">
                      {caseCount} {caseCount === 1 ? 'case' : 'cases'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => handleRunSuite(suite.id)}
                      disabled={caseCount + inSubSuites === 0 || busy?.startsWith('run')}
                      aria-label={`Run suite ${suite.name}`}
                      title={runSuiteTitle(caseCount, inSubSuites, children.length)}
                    >
                      {busy === `run-suite:${suite.id}` ? <Spinner /> : <Play />}
                      <span className="hidden sm:inline">{busy === `run-suite:${suite.id}` ? 'Starting…' : 'Run suite'}</span>
                    </Button>
                    {/* F11: the suite's cases as one Playwright file or a CSV */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          disabled={caseCount === 0 || busy === `export:${suite.id}`}
                          aria-label={`Export ${suite.name}`}
                          title={caseCount === 0 ? 'Add a test case first' : 'Export this suite'}
                        >
                          {busy === `export:${suite.id}` ? <Spinner /> : <Download className="size-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleExportSuite(suite, 'playwright')}>
                          <FileCode className="size-4" />
                          Playwright file (.spec.ts)
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleExportSuite(suite, 'csv')}>
                          <FileSpreadsheet className="size-4" />
                          Spreadsheet (.csv)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                      aria-label={`Delete suite ${suite.name}`}
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
                        projectId={projectId}
                        lastResults={lastResults}
                        cases={suiteDetail.test_cases}
                        moveTargets={suites}
                        onDuplicate={handleDuplicateCase}
                        onMove={handleMoveCase}
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
          onSaved={() => reload(caseDialog.suiteId)}
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
