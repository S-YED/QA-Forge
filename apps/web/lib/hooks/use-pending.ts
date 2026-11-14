import { useState } from 'react';

/**
 * Track which async action is running, so its button can show a spinner and ignore repeat presses.
 * `track('refresh', fn)` returns a click handler.
 */
export function usePending() {
  const [pending, setPending] = useState<string | null>(null);
  const track = (key: string, fn: () => unknown) => async () => {
    if (pending) return;
    setPending(key);
    try {
      await fn();
    } finally {
      setPending(null);
    }
  };
  return { pending, track };
}
