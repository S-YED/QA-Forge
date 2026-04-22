'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api/client';
import type { TestSuite } from '@qaforge/shared-types';

interface AIGeneratePanelProps {
  projectId: string;
  suites: TestSuite[];
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

export function AIGeneratePanel({ projectId, suites, open, onClose, onGenerated }: AIGeneratePanelProps) {
  const [prompt, setPrompt] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [newSuiteName, setNewSuiteName] = useState('');
  const [suiteMode, setSuiteMode] = useState<'existing' | 'new'>('new');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ count: number; suiteName: string; timeMs: number } | null>(null);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Reset when panel opens
  useEffect(() => {
    if (open) {
      setResult(null);
      setError('');
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError('');
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        prompt: prompt.trim(),
      };

      if (suiteMode === 'existing' && suiteId) {
        body.suite_id = suiteId;
      } else if (suiteMode === 'new' && newSuiteName.trim()) {
        body.suite_name = newSuiteName.trim();
      }

      const data = await apiClient.post<{
        suite_id: string;
        test_cases: Array<{ id: string; title: string }>;
        provider_used: string;
        generation_time_ms: number;
      }>(`/api/projects/${projectId}/ai/generate`, body);

      setResult({
        count: data.test_cases.length,
        suiteName: suiteMode === 'existing'
          ? suites.find((s) => s.id === suiteId)?.name || 'Unknown'
          : newSuiteName || 'AI Generated',
        timeMs: data.generation_time_ms,
      });

      // Reset form
      setPrompt('');
      setNewSuiteName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l bg-card shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v3m6.36-.64-2.12 2.12M21 12h-3M18.36 18.36l-2.12-2.12M12 21v-3M5.64 18.36l2.12-2.12M3 12h3M5.64 5.64l2.12 2.12"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">AI Test Generator</h2>
              <p className="text-xs text-muted-foreground">Describe a feature, get test cases instantly</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Describe the feature or flow
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. User login flow with email and password, including forgot password link, validation errors for empty fields, and successful redirect to dashboard."
              className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              rows={5}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Be specific — include UI elements, expected behaviors, and edge cases.
            </p>
          </div>

          {/* Suite selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Target Suite</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSuiteMode('new')}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  suiteMode === 'new'
                    ? 'border-violet-500 bg-violet-500/10 text-violet-600'
                    : 'hover:bg-accent'
                }`}
              >
                Create New Suite
              </button>
              {suites.length > 0 && (
                <button
                  onClick={() => setSuiteMode('existing')}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    suiteMode === 'existing'
                      ? 'border-violet-500 bg-violet-500/10 text-violet-600'
                      : 'hover:bg-accent'
                  }`}
                >
                  Add to Existing
                </button>
              )}
            </div>

            {suiteMode === 'new' ? (
              <input
                type="text"
                value={newSuiteName}
                onChange={(e) => setNewSuiteName(e.target.value)}
                placeholder="Suite name (optional — auto-generated if blank)"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            ) : (
              <select
                value={suiteId}
                onChange={(e) => setSuiteId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Select a suite...</option>
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span className="text-sm font-semibold text-emerald-600">Generation Complete!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Created <strong>{result.count} test cases</strong> in suite &quot;{result.suiteName}&quot;
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Generated in {(result.timeMs / 1000).toFixed(1)}s
              </p>
              <button
                onClick={onGenerated}
                className="mt-3 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-emerald-500"
              >
                View Test Cases →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4">
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                Generating with AI...
              </span>
            ) : (
              'Generate Test Cases'
            )}
          </button>
        </div>
      </div>
    </>
  );
}
