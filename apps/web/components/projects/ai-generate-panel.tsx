'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, CircleCheck, Circle, TriangleAlert, ArrowRight } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';
import type { TestSuite } from '@qaforge/shared-types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/shared/spinner';

interface AIGeneratePanelProps {
  projectId: string;
  suites: TestSuite[];
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

const DEFAULT_PROMPT =
  'Test the homepage end to end: the hero greeting and intro render, the top navigation (home, blog, resume) routes correctly, the contact email link is present, and an unknown route shows a not-found state. Cover happy paths plus validation and edge cases.';

const STAGES = [
  'Analyzing the prompt',
  'Drafting test cases',
  'Writing selectors & assertions',
  'Validating steps',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AIGeneratePanel({
  projectId,
  suites,
  open,
  onClose,
  onGenerated,
}: AIGeneratePanelProps) {
  const isDemo = useDemoMode();
  const [prompt, setPrompt] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [newSuiteName, setNewSuiteName] = useState('');
  const [suiteMode, setSuiteMode] = useState<'existing' | 'new'>('new');
  const [generating, setGenerating] = useState(false);
  const [stageIndex, setStageIndex] = useState(-1);
  const [result, setResult] = useState<{ count: number; suiteName: string; timeMs: number } | null>(
    null,
  );
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus();
  }, [open]);

  // Reset transient state and prefill an example prompt when the panel opens.
  useEffect(() => {
    if (open) {
      setResult(null);
      setError('');
      setStageIndex(-1);
      setPrompt((p) => (p.trim() ? p : DEFAULT_PROMPT));
    }
  }, [open]);

  const targetSuiteName = () =>
    suiteMode === 'existing'
      ? suites.find((s) => s.id === suiteId)?.name || 'Selected suite'
      : newSuiteName.trim() || 'AI generated suite';

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError('');
    setResult(null);
    setGenerating(true);
    setStageIndex(0);

    // Demo: fully simulated so the read-only sandbox still feels live.
    if (isDemo) {
      try {
        for (let i = 0; i < STAGES.length; i++) {
          setStageIndex(i);
          await sleep(620 + i * 180);
        }
        setResult({ count: 6, suiteName: targetSuiteName(), timeMs: 4230 });
      } finally {
        setGenerating(false);
        setStageIndex(-1);
      }
      return;
    }

    // Real generation: advance the stage indicator while the engine works.
    let i = 0;
    const timer = setInterval(() => {
      i = Math.min(i + 1, STAGES.length - 1);
      setStageIndex(i);
    }, 1100);

    try {
      const body: Record<string, unknown> = { prompt: prompt.trim() };
      if (suiteMode === 'existing' && suiteId) body.suite_id = suiteId;
      else if (suiteMode === 'new' && newSuiteName.trim()) body.suite_name = newSuiteName.trim();

      const data = await apiClient.post<{
        suite_id: string;
        test_cases: Array<{ id: string; title: string }>;
        provider_used: string;
        generation_time_ms: number;
      }>(`/api/projects/${projectId}/ai/generate`, body);

      setResult({
        count: data.test_cases.length,
        suiteName: targetSuiteName(),
        timeMs: data.generation_time_ms,
      });
      setPrompt('');
      setNewSuiteName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
    } finally {
      clearInterval(timer);
      setGenerating(false);
      setStageIndex(-1);
    }
  };

  const modeButton = (mode: 'new' | 'existing', label: string) => (
    <button
      type="button"
      onClick={() => setSuiteMode(mode)}
      disabled={generating}
      className={cn(
        'rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
        suiteMode === mode
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o && !generating) onClose();
      }}
    >
      <SheetContent side="right" className="gap-0 p-0">
        <SheetHeader className="border-b px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-[18px]" />
            </span>
            <div>
              <SheetTitle>AI test generator</SheetTitle>
              <SheetDescription>Describe a feature, get test cases instantly.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">Describe the feature or flow</Label>
            <Textarea
              id="ai-prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. User login flow with email and password…"
              rows={6}
              disabled={generating}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Be specific - include UI elements, expected behaviors, and edge cases.
            </p>
          </div>

          {/* Suite target */}
          <div className="space-y-2">
            <Label>Target suite</Label>
            <div className="inline-flex rounded-md border bg-muted p-1">
              {modeButton('new', 'New suite')}
              {suites.length > 0 && modeButton('existing', 'Existing suite')}
            </div>

            {suiteMode === 'new' ? (
              <Input
                value={newSuiteName}
                onChange={(e) => setNewSuiteName(e.target.value)}
                placeholder="Suite name (optional - auto-generated if blank)"
                disabled={generating}
              />
            ) : (
              <Select value={suiteId} onValueChange={setSuiteId} disabled={generating}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a suite…" />
                </SelectTrigger>
                <SelectContent>
                  {suites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Generating progress */}
          {generating && (
            <div className="rounded-lg border bg-secondary/40 p-4">
              <p className="mb-3 text-sm font-medium text-foreground">Generating test cases</p>
              <ul className="space-y-2.5">
                {STAGES.map((s, i) => (
                  <li key={s} className="flex items-center gap-2.5 text-sm">
                    {i < stageIndex ? (
                      <CircleCheck className="size-4 shrink-0 text-success" />
                    ) : i === stageIndex ? (
                      <Spinner className="text-primary" />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground/40" />
                    )}
                    <span className={i <= stageIndex ? 'text-foreground' : 'text-muted-foreground'}>
                      {s}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error */}
          {error && !generating && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {result && !generating && (
            <div className="rounded-lg border border-success/30 bg-success/8 p-4">
              <div className="flex items-center gap-2">
                <CircleCheck className="size-4 text-success" />
                <span className="text-sm font-semibold text-success">Generation complete</span>
              </div>
              <p className="mt-1.5 text-sm text-foreground">
                Created <strong className="font-semibold">{result.count} test cases</strong> in “
                {result.suiteName}”.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Generated in {(result.timeMs / 1000).toFixed(1)}s
              </p>
              <Button className="mt-4 w-full" onClick={onGenerated}>
                View test cases
                <ArrowRight />
              </Button>
            </div>
          )}
        </div>

        <SheetFooter className="border-t px-6 py-5">
          <Button className="w-full" onClick={handleGenerate} disabled={generating || !prompt.trim()}>
            {generating ? (
              <>
                <Spinner className="text-primary-foreground" />
                Generating with AI…
              </>
            ) : (
              <>
                <Sparkles />
                Generate test cases
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
