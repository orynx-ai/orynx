import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { House, PanelLeft, PenLine, Search, Settings, SquareKanban } from 'lucide-react';
import { Button, Kbd, cn } from '@devhub/ui';
import { usePlatform } from '../platform.tsx';
import { useUiStore } from '../stores/ui-store.ts';
import { newTaskShortcut, searchShortcutLabel } from './shortcuts.ts';
import { SidebarFooter } from './sidebar-footer.tsx';
import { SidebarSessions } from './sidebar-sessions.tsx';
import { useNewTask } from './use-shortcuts.ts';

/**
 * Design system: SidebarNav. Places, the most recent sessions and the agent's state.
 * On phones it stacks above the content; it is never fixed to the viewport height.
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
        'flex flex-col gap-4 border-b border-border bg-sidebar p-3 md:shrink-0 md:border-r md:border-b-0',
        collapsed ? 'md:w-16' : 'md:w-72',
      )}
    >
      <div className="flex items-center gap-2.5 py-0.5 pr-0.5 pl-1.5">
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
          className="ml-auto hidden md:inline-flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
          onClick={toggleSidebar}
        >
          <PanelLeft aria-hidden />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Button asChild variant="secondary" className="justify-start">
          <Link
            to="/"
            aria-keyshortcuts={newTask.ariaKeyShortcuts}
            onClick={(event) => {
              // Same as the shortcut: Home, with focus on its content. Modified clicks open a new tab as usual.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              startNewTask();
            }}
          >
            <PenLine aria-hidden />
            <Label collapsed={collapsed}>New task</Label>
            <Kbd className={cn('ml-auto', collapsed && 'md:hidden')}>{newTask.label}</Kbd>
          </Link>
        </Button>
        <button
          type="button"
          disabled
          className="flex h-8.5 w-full cursor-not-allowed items-center gap-2 rounded-sm border border-border bg-canvas px-2.5 text-muted-foreground"
        >
          <Search aria-hidden />
          <Label collapsed={collapsed}>Search</Label>
          <Kbd className={cn('ml-auto', collapsed && 'md:hidden')}>{searchShortcutLabel(platform)}</Kbd>
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <NavItem to="/" icon={<House aria-hidden />} label="Home" collapsed={collapsed} exact />
        <NavItem to="/tickets" icon={<SquareKanban aria-hidden />} label="Tickets" collapsed={collapsed} />
        <NavItem to="/settings" icon={<Settings aria-hidden />} label="Settings" collapsed={collapsed} />
      </div>

      <SidebarSessions className={cn('flex flex-col gap-0.5', collapsed && 'md:hidden')} />

      <SidebarFooter collapsed={collapsed} />
    </nav>
  );
}

function Label({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return <span className={cn('truncate', collapsed && 'md:sr-only')}>{children}</span>;
}

function NavItem({
  to,
  icon,
  label,
  collapsed,
  exact = false,
}: {
  to: '/' | '/tickets' | '/settings';
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="group flex min-h-8.5 items-center gap-2.5 rounded-sm px-2.5 font-medium text-muted-foreground no-underline hover:bg-subtle hover:text-foreground aria-[current=page]:bg-subtle aria-[current=page]:text-foreground"
    >
      <span className="contents group-aria-[current=page]:text-info">{icon}</span>
      <Label collapsed={collapsed}>{label}</Label>
    </Link>
  );
}
