'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FolderKanban,
  KeyRound,
  User,
  Plug,
  Sun,
  Moon,
  LogOut,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { Logo } from '@/components/brand/logo';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Workspace',
    items: [{ label: 'Projects', href: '/dashboard/projects', icon: FolderKanban }],
  },
  {
    label: 'Settings',
    items: [
      { label: 'AI keys', href: '/dashboard/settings/ai-keys', icon: KeyRound },
      { label: 'Profile', href: '/dashboard/settings/profile', icon: User },
      { label: 'Integrations', href: '/dashboard/settings/integrations', icon: Plug },
    ],
  },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 duration-200 animate-in fade-in md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] md:sticky md:top-0 md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link
            href="/dashboard/projects"
            onClick={onClose}
            className="rounded-md focus-visible:outline-none"
          >
            <Logo />
          </Link>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground md:hidden"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 overflow-y-auto p-3">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-3 pb-1 text-[0.6875rem] font-semibold text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-[18px] shrink-0 transition-colors',
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="space-y-1 border-t border-sidebar-border p-3">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-[18px]" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
