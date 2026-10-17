import type { CSSProperties, ReactNode } from 'react';
import { Link, useLinkProps } from '@tanstack/react-router';
import { History, House, PanelLeft, PenLine, Search, Settings, SquareKanban } from 'lucide-react';
import { Button, Kbd, Splitter, cn } from '@devhub/ui';
import { SidebarSessions } from '../features/sessions/components/sidebar-sessions.tsx';
import { usePlatform } from '../platform.tsx';
import { clampSidebarWidth, sidebarWidthLimits, useUiStore } from '../stores/ui-store.ts';
import { newTaskShortcut, searchShortcutLabel } from './shortcuts.ts';
import { SidebarFooter } from './sidebar-footer.tsx';
import { useNewTask } from './use-shortcuts.ts';

/**
 * Design system: SidebarNav. Places, the most recent sessions and the agent's state.
 * Under 768 px it is a compact bar above the content (spec 001, Q3): the logo with New task
 * and Search as icon buttons, then the places in one row, with Sessions linking to the full
 * list. It is never fixed to the viewport height.
 * From 768 px it is 300 px wide by default and the user can drag its edge between 260 and
 * 400 px (spec 001, Q10). The width is a remembered preference, so the first paint already uses it.
 */
const sidebarId = 'sidebar';

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const width = useUiStore((state) => clampSidebarWidth(state.sidebarWidth));
  const setWidth = useUiStore((state) => state.setSidebarWidth);
  const widthStyle: CSSProperties & Record<'--sidebar-width', string> = { '--sidebar-width': `${String(width)}px` };
  const platform = usePlatform();
  const newTask = newTaskShortcut(platform);
  const startNewTask = useNewTask();
  // New task is an action, so it must never announce itself as the current page on Home.
  // Only the router's href (hash or path, per host); the click is handled below.
  const { href: homeHref } = useLinkProps({ to: '/' });

  return (
    <nav
      id={sidebarId}
      aria-label="Main"
      style={widthStyle}
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-border bg-sidebar p-3 md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-5 md:border-e md:border-b-0',
        'md:relative',
        collapsed ? 'md:w-16' : 'md:w-(--sidebar-width)',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 ps-1 md:flex-none',
          collapsed && 'md:flex-col md:gap-2 md:px-0',
        )}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary font-medium text-primary-foreground"
        >
          D
        </span>
        <span className={cn('text-title font-medium', collapsed && 'md:sr-only')}>DevHub</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('ms-auto hidden md:inline-flex', collapsed && 'md:ms-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : undefined}
          aria-pressed={collapsed}
          onClick={toggleSidebar}
        >
          <PanelLeft aria-hidden />
        </Button>
      </div>

      <div className="flex gap-2 md:flex-col">
        <Button
          asChild
          variant="secondary"
          className={cn(
            'justify-start px-3 max-md:w-10 max-md:justify-center max-md:px-0',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <a
            href={homeHref}
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
            <Kbd className={cn('ms-auto max-md:hidden', collapsed && 'md:hidden')}>{newTask.label}</Kbd>
          </a>
        </Button>
        <button
          type="button"
          // aria-disabled, not disabled: it stays in the Tab order with its name and key until search ships (spec 009).
          aria-disabled
          title={collapsed ? 'Search' : undefined}
          className={cn(
            'flex h-10 w-full cursor-not-allowed items-center gap-2 rounded-sm border border-border bg-canvas px-3 text-muted-foreground max-md:size-10 max-md:justify-center max-md:px-0',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <Search aria-hidden />
          <Label collapsed={collapsed} className="max-md:sr-only">
            Search
          </Label>
          <Kbd className={cn('ms-auto max-md:hidden', collapsed && 'md:hidden')}>{searchShortcutLabel(platform)}</Kbd>
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

      {collapsed ? null : (
        <Splitter
          aria-label="Resize sidebar"
          aria-controls={sidebarId}
          value={width}
          min={sidebarWidthLimits.min}
          max={sidebarWidthLimits.max}
          defaultValue={sidebarWidthLimits.initial}
          onValueChange={setWidth}
          // Over the sidebar's right border; narrow windows stack the sidebar, so there is nothing to resize.
          className="absolute inset-y-0 -end-1.5 z-10 max-md:hidden"
        />
      )}
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
        'group flex min-h-10 items-center gap-3 rounded-sm px-3 font-medium text-muted-foreground no-underline hover:bg-subtle hover:text-foreground aria-[current=page]:bg-subtle aria-[current=page]:text-foreground',
        // Narrow windows: icon over a 14 px label, four to a row.
        'max-md:flex-col max-md:gap-1 max-md:px-1 max-md:py-1.5 max-md:text-small',
        collapsed && 'md:justify-center md:px-0',
        className,
      )}
    >
      <span className="contents group-aria-[current=page]:text-info">{icon}</span>
      <Label collapsed={collapsed}>{label}</Label>
    </Link>
  );
}
