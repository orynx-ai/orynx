import type { CSSProperties, ReactNode } from 'react';
import { Link, useLinkProps } from '@tanstack/react-router';
import {
  HistoryIcon,
  Home03Icon,
  PencilEdit02Icon,
  Search01Icon,
  Settings02Icon,
  SidebarLeftIcon,
  Ticket01Icon,
} from '@hugeicons/core-free-icons';
import { BrandMark, Button, cn, Icon, Kbd, Splitter } from '@devhub/ui';
import { useInboxCount } from '../features/home/queries.ts';
import { useSearchStore } from '../features/search/store.ts';
import { useTicketsCount } from '../features/tickets/queries.ts';
import { SidebarSessions } from '../features/sessions/components/sidebar-sessions.tsx';
import { usePlatform } from '../platform.tsx';
import { clampSidebarWidth, sidebarWidthLimits, useUiStore } from '../stores/ui-store.ts';
import { newTaskShortcut, searchShortcut } from './shortcuts.ts';
import { SidebarFooter } from './sidebar-footer.tsx';
import { useNewTask } from './use-shortcuts.ts';

/**
 * Design system: SidebarNav. Places, the most recent sessions and the agent's state.
 * Under 768 px it is a compact bar above the content (spec 001, Q3): the logo with New task
 * and Search as icon buttons, then the places in one row, with Sessions linking to the full
 * list. It scrolls away with the page.
 * From 768 px it stays in place while the page scrolls, as tall as the window (the user's call,
 * 2026-10-17); in a short window its session list scrolls inside it. It is 300 px wide by default
 * and the user can drag its edge between 260 and 400 px (spec 001, Q10). The width is a
 * remembered preference, so the first paint already uses it.
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
  const search = searchShortcut(platform);
  const openSearch = useSearchStore((state) => state.setOpen);
  const startNewTask = useNewTask();
  // New task is an action, so it must never announce itself as the current page on Home.
  // Only the router's href (hash or path, per host); the click is handled below.
  const { href: homeHref } = useLinkProps({ to: '/' });
  const needYou = useInboxCount();
  const inSprint = useTicketsCount();

  return (
    <nav
      id={sidebarId}
      aria-label="Main"
      style={widthStyle}
      className={cn(
        'flex flex-wrap items-center gap-2 border-b border-border bg-sidebar p-3 md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-5 md:border-e md:border-b-0',
        // Above the page bar, so the resize edge can be grabbed beside it too.
        'md:sticky md:top-0 md:z-20 md:h-dvh',
        collapsed ? 'md:w-16' : 'md:w-(--sidebar-width)',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 ps-1 md:flex-none',
          collapsed && 'md:flex-col md:gap-2 md:px-0',
        )}
      >
        <span className="flex min-h-8 items-center gap-2">
          <BrandMark />
          <span className={cn('text-title font-medium', collapsed && 'md:sr-only')}>Orynx</span>
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('ms-auto hidden md:inline-flex', collapsed && 'md:ms-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : undefined}
          aria-pressed={collapsed}
          onClick={toggleSidebar}
        >
          <Icon icon={SidebarLeftIcon} aria-hidden />
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
            <Icon icon={PencilEdit02Icon} aria-hidden />
            <Label collapsed={collapsed} className="max-md:sr-only">
              New task
            </Label>
            <Kbd className={cn('ms-auto max-md:hidden', collapsed && 'md:hidden')}>{newTask.label}</Kbd>
          </a>
        </Button>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-keyshortcuts={search.ariaKeyShortcuts}
          title={collapsed ? 'Search' : undefined}
          onClick={(event) => {
            // Safari doesn't focus a clicked button; focus it, so closing search gives focus back here.
            event.currentTarget.focus();
            openSearch(true);
          }}
          className={cn(
            'flex h-10 w-full cursor-pointer items-center gap-2 rounded-sm border border-border bg-canvas px-3 text-muted-foreground hover:border-control hover:text-foreground max-md:size-10 max-md:justify-center max-md:px-0',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <Icon icon={Search01Icon} aria-hidden />
          <Label collapsed={collapsed} className="max-md:sr-only">
            Search
          </Label>
          <Kbd className={cn('ms-auto max-md:hidden', collapsed && 'md:hidden')}>{search.label}</Kbd>
        </button>
      </div>

      <div className="grid w-full grid-cols-4 gap-1 md:flex md:flex-col md:gap-0.5">
        <NavItem
          to="/"
          icon={<Icon icon={Home03Icon} aria-hidden />}
          label="Home"
          collapsed={collapsed}
          exact
          {...(needYou === undefined
            ? {}
            : { count: { value: needYou, spoken: `${String(needYou)} ${needYou === 1 ? 'needs' : 'need'} you` } })}
        />
        <NavItem
          to="/tickets"
          icon={<Icon icon={Ticket01Icon} aria-hidden />}
          label="Tickets"
          collapsed={collapsed}
          // Spec 008, Q6: your tickets in the sprint, Done included, as the design draws "9".
          {...(inSprint === undefined
            ? {}
            : { count: { value: inSprint, spoken: `${String(inSprint)} in your sprint` } })}
        />
        <NavItem
          to="/settings"
          icon={<Icon icon={Settings02Icon} aria-hidden />}
          label="Settings"
          collapsed={collapsed}
        />
        {/* Narrow windows have no session rows, so the full list gets a place of its own. */}
        <NavItem
          to="/sessions"
          icon={<Icon icon={HistoryIcon} aria-hidden />}
          label="Sessions"
          collapsed={collapsed}
          className="md:hidden"
        />
      </div>

      {/* The rail has no room for session rows; "View all" is one click away once expanded. */}
      {/* The part that gives way in a short window. Its inset leaves room for the focus rings: 4 px for the rows,
          10 px on top for View all, whose hit area reaches 6 px above its heading. */}
      {collapsed ? null : (
        <SidebarSessions className="hidden flex-col gap-0.5 md:-mx-1 md:-mt-2.5 md:-mb-1 md:flex md:min-h-0 md:overflow-y-auto md:px-1 md:pt-2.5 md:pb-1" />
      )}

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
  count,
  className,
}: {
  to: '/' | '/tickets' | '/settings' | '/sessions';
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  exact?: boolean;
  /** Design system: `.dh-nav-count`, and what a screen reader hears for it ("14 need you"). */
  count?: { value: number; spoken: string };
  className?: string;
}) {
  const showCount = count !== undefined && count.value > 0 && !collapsed;
  return (
    <Link
      to={to}
      // A place is its path: Home stays current with its tab, search or page in the address.
      activeOptions={{ exact, includeSearch: false }}
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
      {/* Hidden at 0, and on the collapsed rail and the narrow bar, where there is no room (spec 007, Q1b). */}
      <Label collapsed={collapsed}>
        {label}
        {/* Inside the label, so the link reads "Home, 14 need you" (Chrome adds a space before the comma). */}
        {showCount ? <span className="sr-only max-md:hidden">{`, ${count.spoken}`}</span> : null}
      </Label>
      {showCount ? (
        <span
          aria-hidden
          className="ms-auto inline-flex h-5 min-w-5.5 items-center justify-center rounded-full border border-border bg-canvas px-1.5 text-label font-medium text-muted-foreground group-aria-[current=page]:border-transparent group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground max-md:hidden"
        >
          {count.value}
        </span>
      ) : null}
    </Link>
  );
}
