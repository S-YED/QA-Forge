'use client';

import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/components/theme-provider';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      // U4: row actions (Run, Delete, Rename) and dialog buttons sit at the right edge; notices there covered them.
      position="bottom-center"
      visibleToasts={2}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:rounded-lg group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error: 'group-[.toaster]:!text-destructive',
          success: 'group-[.toaster]:!text-success',
        },
      }}
      {...props}
    />
  );
}
