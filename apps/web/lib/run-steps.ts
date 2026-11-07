// A live run's steps arrive from two sources: socket events and reloads from the API.
// Both are merged by step_number so a missed or late event can't drop or duplicate a step.

export interface StepLike {
  step_number: number;
  status: string;
}

/** pending and running runs are still executing; everything else is final. */
export function isRunActive(status: string): boolean {
  return status === 'pending' || status === 'running';
}

/** Insert or update one step by step_number, keeping the list in step order. */
export function upsertStep<T extends StepLike>(steps: T[], patch: Partial<T> & { step_number: number }): T[] {
  const i = steps.findIndex((s) => s.step_number === patch.step_number);
  const next = i === -1 ? [...steps, patch as T] : steps.map((s, j) => (j === i ? { ...s, ...patch } : s));
  return next.sort((a, b) => a.step_number - b.step_number);
}

/** Fold the steps saved in the database over the live list: saved results win, live-only (running) steps stay. */
export function mergeSavedSteps<T extends StepLike>(live: T[], saved: T[]): T[] {
  return saved.reduce((acc, s) => upsertStep(acc, s), live);
}
