import { toast } from 'sonner';
import { UNREACHABLE } from '@/lib/api/client';

/**
 * Show a failed action to the user with the server's reason; never swallow an error silently.
 * U4: with the server unreachable a page's several loads all fail at once; they share one notice instead of a pile.
 */
export function toastError(title: string, err: unknown) {
  const description = err instanceof Error ? err.message : 'Please try again.';
  toast.error(title, { description, ...(description === UNREACHABLE && { id: 'server-unreachable' }) });
}
