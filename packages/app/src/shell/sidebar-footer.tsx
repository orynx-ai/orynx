import { Link } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { Avatar, cn } from '@devhub/ui';
import { useStatus } from '../features/settings/queries.ts';
import { personName } from './person-name.ts';

/**
 * The footer (design system: SidebarNav): who is using DevHub and whether Claude is
 * reachable, in words and a dot, never colour alone. It links to Settings.
 * The leading slot is always avatar-sized, so nothing moves when the status arrives.
 */
export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const status = useStatus();
  const name = status.data?.user.name ?? null;
  const person = name === null ? null : personName(name);
  // Nothing while the status loads: "You" means DevHub knows no name (Q6), which it cannot say yet.
  const who = status.isPending ? '\u00a0' : (person?.short ?? 'You');

  const { text, dot } = status.isPending
    ? { text: 'Checking…', dot: 'text-muted-foreground' }
    : status.isError
      ? { text: 'DevHub server not reachable', dot: 'text-danger' }
      : status.data.agent.connected
        ? { text: 'Claude connected · runs locally', dot: 'text-success' }
        : { text: 'Claude not connected · runs locally', dot: 'text-muted-foreground' };

  return (
    <div className="mt-auto border-t border-border pt-3 max-md:hidden">
      <Link
        to="/settings"
        // Exact, so the footer is never a second "current page" next to the Settings place.
        activeOptions={{ exact: true }}
        title={collapsed ? `${who} · ${text}` : undefined}
        className={cn(
          'flex items-center gap-3 rounded-sm px-2 py-2 text-foreground no-underline hover:bg-subtle',
          collapsed && 'md:justify-center md:px-0',
        )}
      >
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
          {person === null ? <UserRound /> : <Avatar initials={person.initials} size="lg" />}
        </span>
        <span className={cn('flex min-w-0 flex-col gap-px', collapsed && 'md:sr-only')}>
          <span className="truncate font-medium">{who}</span>{' '}
          <span className="flex min-w-0 items-center gap-1.5 text-small text-muted-foreground">
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-current', dot)} />
            <span className="truncate">{text}</span>
          </span>
        </span>
      </Link>
    </div>
  );
}
