import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { History, House, PanelLeft, PenLine, Search, Settings, SquareKanban } from 'lucide-react';
import { Button, Kbd, cn } from '@devhub/ui';
import { usePlatform } from '../platform.tsx';
import { useUiStore } from '../stores/ui-store.ts';
import { newTaskShortcut, searchShortcutLabel } from './shortcuts.ts';
import { SidebarFooter } from './sidebar-footer.tsx';
import { SidebarSessions } from './sidebar-sessions.tsx';
import { useNewTask } from './use-shortcuts.ts';

/**
 * Design system: SidebarNav. Places, the most recent sessions and the agent's state.
 * Under 768 px it is a compact bar above the content (spec 001, Q3): the logo with New task
 * and Search as icon buttons, then the places in one row, with Sessions linking to the full
 * list. It is never fixed to the viewport height.
 * 288 px wide, not the design system's 248–260: the footer's longest line ("Claude not
 * connected · runs locally") needs it, and the screens render the sidebar at 283 px.
 * The width stays fixed, so nothing shifts when the status arrives.
 */
export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const platform = usePlatform();
  const newTask = newTaskShortcut(platform);
  const startNewTask = useNewTask();

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-border bg-sidebar p-3 md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-4 md:border-r md:border-b-0',
        collapsed ? 'md:w-16' : 'md:w-72',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 py-0.5 pr-0.5 pl-1.5 md:flex-none',
          collapsed && 'md:flex-col md:gap-2 md:px-0',
        )}
      >
        <span
          aria-hidden
          className="flex size-6.5 shrink-0 items-center justify-center rounded-sm bg-primary text-small font-semibold text-primary-foreground"
        >
          D
        </span>
        <span className={cn('text-title font-semibold', collapsed && 'md:sr-only')}>DevHub</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('ml-auto hidden md:inline-flex', collapsed && 'md:ml-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : undefined}
          aria-pressed={collapsed}
          onClick={toggleSidebar}
        >
          <PanelLeft aria-hidden />
        </Button>
      </div>

      <div className="flex gap-1.5 md:flex-col">
        <Button
          asChild
          variant="secondary"
          className={cn(
            'justify-start max-md:w-9 max-md:justify-center max-md:px-0',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <Link
            to="/"
            aria-keyshortcuts={newTask.ariaKeyShortcuts}
            title={collapsed ? `New task (${newTask.label})` : undefined}
            onClick={(event) => {
              // Same as the shortcut: Home, with focus on its content. Modified clicks open a new tab as usual.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              startNewTask();
            }}
          >
            <PenLine aria-hidden />
            <Label collapsed={collapsed} className="max-md:sr-only">
              New task
            </Label>
            <Kbd className={cn('ml-auto max-md:hidden', collapsed && 'md:hidden')}>{newTask.label}</Kbd>
          </Link>
        </Button>
        <button
          type="button"
          disabled
          title={collapsed ? 'Search' : undefined}
          className={cn(
            'flex h-8.5 w-full cursor-not-allowed items-center gap-2 rounded-sm border border-border bg-canvas px-2.5 text-muted-foreground max-md:size-9 max-md:justify-center max-md:px-0',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <Search aria-hidden />
          <Label collapsed={collapsed} className="max-md:sr-only">
            Search
          </Label>
          <Kbd className={cn('ml-auto max-md:hidden', collapsed && 'md:hidden')}>{searchShortcutLabel(platform)}</Kbd>
        </button>
      </div>

      <div className="grid w-full grid-cols-4 gap-1 md:flex md:flex-col md:gap-0.5">
        <NavItem to="/" icon={<House aria-hidden />} label="Home" collapsed={collapsed} exact />
        <NavItem to="/tickets" icon={<SquareKanban aria-hidden />} label="Tickets" collapsed={collapsed} />
        <NavItem to="/settings" icon={<Settings aria-hidden />} label="Settings" collapsed={collapsed} />
        {/* Narrow windows have no session rows, so the full list gets a place of its own. */}
        <NavItem
          to="/sessions"
          icon={<History aria-hidden />}
          label="Sessions"
          collapsed={collapsed}
          className="md:hidden"
        />
      </div>

      {/* The rail has no room for session rows; "View all" is one click away once expanded. */}
      {collapsed ? null : <SidebarSessions className="hidden flex-col gap-0.5 md:flex" />}

      <SidebarFooter collapsed={collapsed} />
    </nav>
  );
}

function Label({ collapsed, className, children }: { collapsed: boolean; className?: string; children: ReactNode }) {
  return <span className={cn('truncate', collapsed && 'md:sr-only', className)}>{children}</span>;
}

function NavItem({
  to,
  icon,
  label,
  collapsed,
  exact = false,
  className,
}: {
  to: '/' | '/tickets' | '/settings' | '/sessions';
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  exact?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      title={collapsed ? label : undefined}
      className={cn(
        'group flex min-h-8.5 items-center gap-2.5 rounded-sm px-2.5 font-medium text-muted-foreground no-underline hover:bg-subtle hover:text-foreground aria-[current=page]:bg-subtle aria-[current=page]:text-foreground',
        // Narrow windows: icon over a 12 px label, four to a row.
        'max-md:flex-col max-md:gap-1 max-md:px-1 max-md:py-1.5 max-md:text-label',
        collapsed && 'md:justify-center md:px-0',
        className,
      )}
    >
      <span className="contents group-aria-[current=page]:text-info">{icon}</span>
      <Label collapsed={collapsed}>{label}</Label>
    </Link>
  );
}
