import { toast } from 'sonner';

/** Show a failed action to the user with the server's reason; never swallow an error silently. */
export function toastError(title: string, err: unknown) {
  toast.error(title, { description: err instanceof Error ? err.message : 'Please try again.' });
}
