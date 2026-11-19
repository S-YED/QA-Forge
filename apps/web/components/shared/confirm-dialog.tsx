'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** The verb on the button that goes ahead, e.g. "Delete suite" */
  confirmLabel: string;
  cancelLabel?: string;
  /** Red button for an action that cannot be undone */
  destructive?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/**
 * U4: the app's own confirm box in place of the browser's `confirm()`. Mounted once in the dashboard;
 * `useConfirm()` returns `ask`, which shows the box and resolves true only when the person goes ahead.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Kept after closing so the text does not vanish during the close animation.
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const answer = useRef<((yes: boolean) => void) | null>(null);

  const settle = useCallback((yes: boolean) => {
    answer.current?.(yes);
    answer.current = null;
    setOpen(false);
  }, []);

  // CR-10: the provider outlives pages (it sits in the dashboard layout); a question still open when the address
  // changes is answered "no", so it can never act for a page that is gone (e.g. delete a project after Back).
  const pathname = usePathname();
  useEffect(() => settle(false), [pathname, settle]);

  const ask = useCallback<Ask>((next) => {
    answer.current?.(false); // a second question cancels the first
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
      setOptions(next);
      setOpen(true);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && settle(false)}>
        {/* Above other dialogs (they use z-40/z-50): the box can open over the case editor and must dim it. */}
        <DialogPortal>
          <DialogOverlay className="z-[60]" />
          <DialogPrimitive.Content
            role="alertdialog"
            className="fixed left-1/2 top-1/2 z-[70] grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 border bg-popover p-6 shadow-xl duration-200 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
          >
            <DialogHeader>
              <DialogTitle>{options?.title}</DialogTitle>
              {options?.description && <DialogDescription>{options.description}</DialogDescription>}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => settle(false)}>
                {options?.cancelLabel ?? 'Cancel'}
              </Button>
              <Button variant={options?.destructive ? 'destructive' : 'default'} onClick={() => settle(true)}>
                {options?.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * For a dialog that can open the confirm box over itself, as its `onInteractOutside`: a click in that box is not
 * a click outside the dialog. Without it the dialog asked to close again and the box reappeared (U4).
 */
export function keepOpenForConfirm(event: { target: EventTarget | null; preventDefault: () => void }) {
  if ((event.target as Element | null)?.closest?.('[role="alertdialog"]')) event.preventDefault();
}

/** Ask the person before doing something; resolves true only when they choose the confirm button. */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm needs a ConfirmProvider above it');
  return ask;
}
