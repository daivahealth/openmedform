'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Settings,
  BarChart3,
  SlidersHorizontal,
  Globe,
  Coins,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/lib/stores/sidebar-store';
import { useAuth } from '@/providers/auth-provider';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Highlight only on an exact path match (for parents of sub-routes). */
  exact?: boolean;
}

const baseNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/forms', label: 'Forms', icon: FileText },
  { href: '/submissions', label: 'Records', icon: Inbox },
  { href: '/settings', label: 'AI Settings', icon: Settings },
];

/**
 * SUPER_ADMIN-only operator consoles. Previously only /admin was linked, which
 * left the other admin screens reachable by URL only.
 */
const adminNavItems: NavItem[] = [
  { href: '/admin', label: 'Analytics', icon: BarChart3, exact: true },
  { href: '/admin/limits', label: 'Form limits', icon: SlidersHorizontal },
  { href: '/admin/ai-providers', label: 'Global AI', icon: Globe },
  { href: '/admin/usage', label: 'Token usage', icon: Coins },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  function renderItem(item: NavItem) {
    const isActive = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname?.startsWith(item.href + '/');
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex items-center rounded-md text-sm font-medium transition-colors',
          collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && item.label}
      </Link>
    );
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-background transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b',
          collapsed ? 'justify-center px-2' : 'gap-2 px-6',
        )}
      >
        <ClipboardList className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && <span className="text-lg font-bold">OpenMedForm</span>}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {baseNavItems.map(renderItem)}

        {isSuperAdmin && (
          <>
            <div className="my-2 border-t" />
            {!collapsed && (
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Admin
              </p>
            )}
            {adminNavItems.map(renderItem)}
          </>
        )}
      </nav>

      <div className="border-t p-2">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center rounded-md px-2 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
