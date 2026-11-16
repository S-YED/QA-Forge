import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { useDemoMode } from '@/lib/hooks/use-demo-mode';

/** Shown on a "Run again" button whose test case no longer exists. */
export const CASE_DELETED = 'The test case was deleted, so this run cannot be started again.';

/**
 * F2: start a new run of the same test case and open it. `busy` is the id passed to the start in
 * flight (so that button shows a spinner and none can be pressed twice), kept until the run page takes over.
 */
export function useRunAgain(projectId: string) {
  const router = useRouter();
  const isDemo = useDemoMode();
  const [busy, setBusy] = useState<string | null>(null);

  const runAgain = async (testCaseId: string, busyId: string = testCaseId) => {
    if (busy) return;
    if (isDemo) {
      toast.info('Demo is read-only', { description: 'Sign up to launch real test runs against your own apps.' });
      return;
    }
    setBusy(busyId);
    try {
      const data = await apiClient.post<{ test_run: { id: string } }>(`/api/projects/${projectId}/test-runs`, {
        test_case_id: testCaseId,
        mode: 'ai_driven',
        browser: 'chromium',
      });
      router.push(`/dashboard/projects/${projectId}/runs/${data.test_run.id}`);
    } catch (err) {
      toastError('Could not start the run', err);
      setBusy(null);
    }
  };

  return { busy, runAgain };
}
