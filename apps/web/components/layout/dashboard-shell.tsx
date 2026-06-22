'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './sidebar';
import { DemoBanner } from './demo-banner';
import { Logo } from '@/components/brand/logo';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />

        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md md:hidden">
          <Logo />
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </header>

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-7xl px-5 py-7 lg:px-8 lg:py-9">{children}</div>
        </main>
      </div>
    </div>
  );
}
