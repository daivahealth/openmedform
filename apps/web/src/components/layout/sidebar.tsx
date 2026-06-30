'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Settings,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/lib/stores/sidebar-store';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/forms', label: 'Forms', icon: FileText },
  { href: '/submissions', label: 'Responses', icon: Inbox },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();

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
        {!collapsed && (
          <span className="text-lg font-bold">OpenMedForm</span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed
                  ? 'justify-center px-2 py-2'
                  : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
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
