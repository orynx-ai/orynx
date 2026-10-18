import { Link } from '@tanstack/react-router';
import { UserIcon } from '@hugeicons/core-free-icons';
import { Avatar, cn, Icon, Tooltip } from '@devhub/ui';
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
      ? { text: 'Orynx server not reachable', dot: 'text-danger' }
      : status.data.agent.connected
        ? { text: 'Claude connected · runs locally', dot: 'text-success' }
        : { text: 'Claude not connected · runs locally', dot: 'text-muted-foreground' };

  return (
    <div className="mt-auto border-t border-border pt-3 max-md:hidden">
      {/* On the rail only the avatar shows, so who and Claude's state are in a tooltip beside it. */}
      <Tooltip label={collapsed ? `${who} · ${text}` : null} side="right">
        <Link
          to="/settings"
          // Exact, so the footer is never a second "current page" next to the Settings place.
          activeOptions={{ exact: true }}
          className={cn(
            'flex items-center gap-3 rounded-sm px-2 py-2 text-foreground no-underline hover:bg-subtle',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
            {person === null ? <Icon icon={UserIcon} /> : <Avatar initials={person.initials} size="lg" />}
          </span>
          <span className={cn('flex min-w-0 flex-col gap-px', collapsed && 'md:sr-only')}>
            <span className="truncate font-medium">{who}</span>{' '}
            <span className="flex min-w-0 items-center gap-1.5 text-small text-muted-foreground">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-current', dot)} />
              {/* At the default width this line is cut; the tooltip keeps it readable. */}
              <span className="truncate" title={text}>
                {text}
              </span>
            </span>
          </span>
        </Link>
      </Tooltip>
    </div>
  );
}
