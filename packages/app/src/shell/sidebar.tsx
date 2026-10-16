import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { House, PanelLeft, PenLine, Search, Settings, SquareKanban } from 'lucide-react';
import { Button, Kbd, cn } from '@devhub/ui';
import { useStatus } from '../features/settings/queries.ts';
import { useUiStore } from '../stores/ui-store.ts';

/**
 * Design system: SidebarNav. Places, the most recent sessions and the agent's state.
 * On phones it stacks above the content; it is never fixed to the viewport height.
 */
export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex flex-col gap-4 border-b border-border bg-sidebar p-3 md:shrink-0 md:border-r md:border-b-0',
        collapsed ? 'md:w-16' : 'md:w-65',
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
          <Link to="/">
            <PenLine aria-hidden />
            <Label collapsed={collapsed}>New task</Label>
            <Kbd className={cn('ml-auto', collapsed && 'md:hidden')}>⌘N</Kbd>
          </Link>
        </Button>
        <button
          type="button"
          disabled
          className="flex h-8.5 w-full cursor-not-allowed items-center gap-2 rounded-sm border border-border bg-canvas px-2.5 text-muted-foreground"
        >
          <Search aria-hidden />
          <Label collapsed={collapsed}>Search</Label>
          <Kbd className={cn('ml-auto', collapsed && 'md:hidden')}>⌘K</Kbd>
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <NavItem to="/" icon={<House aria-hidden />} label="Home" collapsed={collapsed} exact />
        <NavItem to="/tickets" icon={<SquareKanban aria-hidden />} label="Tickets" collapsed={collapsed} />
        <NavItem to="/settings" icon={<Settings aria-hidden />} label="Settings" collapsed={collapsed} />
      </div>

      <div className={cn('flex flex-col gap-0.5', collapsed && 'md:hidden')}>
        <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-label font-medium text-muted-foreground">
          <h2 className="m-0 text-label font-medium">Sessions</h2>
          <Link
            to="/sessions"
            className="ml-auto rounded-xs px-1 text-muted-foreground no-underline hover:bg-subtle hover:text-foreground"
          >
            View all
          </Link>
        </div>
        <p className="m-0 px-2.5 py-2 text-small text-muted-foreground">No sessions yet</p>
      </div>

      <AgentStatus collapsed={collapsed} />
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

/**
 * The footer: whether Claude is reachable, in words and a dot, never colour alone.
 * Two lines like the design's user row, so the state never gets cut off.
 */
function AgentStatus({ collapsed }: { collapsed: boolean }) {
  const status = useStatus();

  const { text, dot } = status.isPending
    ? { text: 'Checking…', dot: 'text-muted-foreground' }
    : status.isError
      ? { text: 'DevHub server not reachable', dot: 'text-danger' }
      : status.data.agent.connected
        ? { text: 'Connected · runs locally', dot: 'text-success' }
        : { text: 'Not connected · runs locally', dot: 'text-muted-foreground' };

  return (
    <div className="mt-auto border-t border-border pt-3">
      <Link
        to="/settings"
        className="flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-foreground no-underline hover:bg-subtle"
      >
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-current', dot)} />
        <span className={cn('flex min-w-0 flex-col', collapsed && 'md:sr-only')}>
          <span className="font-medium">Claude</span>
          <span className="truncate text-label text-muted-foreground">{text}</span>
        </span>
      </Link>
    </div>
  );
}
