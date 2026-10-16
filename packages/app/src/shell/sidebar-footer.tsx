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
  const who = person?.short ?? 'You';

  const { text, dot } = status.isPending
    ? { text: 'Checking…', dot: 'text-muted-foreground' }
    : status.isError
      ? { text: 'DevHub server not reachable', dot: 'text-danger' }
      : status.data.agent.connected
        ? { text: 'Claude connected · runs locally', dot: 'text-success' }
        : { text: 'Claude not connected · runs locally', dot: 'text-muted-foreground' };

  return (
    <div className="mt-auto border-t border-border pt-3">
      <Link
        to="/settings"
        title={collapsed ? `${who} · ${text}` : undefined}
        className={cn(
          'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-foreground no-underline hover:bg-subtle',
          collapsed && 'md:justify-center md:px-0',
        )}
      >
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
          {person === null ? <UserRound /> : <Avatar initials={person.initials} size="lg" />}
        </span>
        <span className={cn('flex min-w-0 flex-col', collapsed && 'md:sr-only')}>
          <span className="truncate font-medium">{who}</span>{' '}
          <span className="flex min-w-0 items-center gap-1 text-label text-muted-foreground">
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-current', dot)} />
            <span className="truncate">{text}</span>
          </span>
        </span>
      </Link>
    </div>
  );
}
