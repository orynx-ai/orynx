import { cn } from '@devhub/ui';
import { NotificationCentre } from '../features/notifications/components/notification-centre.tsx';
import { PersonAvatar, ProfileMenu, usePerson } from './profile-menu.tsx';
import { useWide } from './use-wide.ts';

/**
 * The footer (design system: SidebarNav): who is using Orynx, their name and the bio from Edit profile in place of
 * Claude's state (the user's call, 20 Oct 2026; Home's agent picker still says it). It opens the profile menu: Edit
 * profile, Appearance, Settings. The leading slot is always avatar-sized, so nothing moves when the status arrives.
 * The bell sits after it, or above the avatar on the rail: the user moved it here from the design's head (spec 029).
 */
export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  // Under 768 px the footer is hidden and the bell sits in the top bar instead (spec 029, Q1).
  const wide = useWide();
  const bell = wide ? <NotificationCentre tooltipSide={collapsed ? 'right' : 'top'} /> : null;
  const person = usePerson();
  // Nothing while the status loads: "You" means DevHub knows no name (Q6), which it cannot say yet.
  const who = person.pending ? ' ' : (person.name ?? 'You');

  return (
    <div
      className={cn(
        'mt-auto flex items-center gap-1 border-t border-border pt-3 max-md:hidden',
        collapsed && 'md:flex-col md:gap-2',
      )}
    >
      {collapsed ? bell : null}
      {/* On the rail only the avatar shows, so the name and bio are in a tooltip beside it. */}
      <ProfileMenu
        side={collapsed ? 'right' : 'top'}
        tooltip={collapsed ? [who, person.bio].filter((line) => line !== '').join(' · ') : null}
        tooltipSide="right"
      >
        <button
          type="button"
          className={cn(
            'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-start text-foreground hover:bg-subtle data-[state=open]:bg-subtle',
            collapsed && 'md:w-full md:justify-center md:px-0',
          )}
        >
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
            <PersonAvatar size="lg" />
          </span>
          <span className={cn('flex min-w-0 flex-col gap-px', collapsed && 'md:sr-only')}>
            {/* Says what the button opens, as the narrow bar's avatar does. */}
            <span className="sr-only">Profile:</span>{' '}
            {/* One step down the scale, as the rest of the sidebar (spec 039, Q4). */}
            <span className="truncate text-small font-medium">{who}</span>
            {person.bio === '' ? null : (
              <>
                {' '}
                {/* At the default width a long bio is cut; its title keeps it readable. */}
                <span className="truncate text-label text-muted-foreground" title={person.bio}>
                  {person.bio}
                </span>
              </>
            )}
          </span>
        </button>
      </ProfileMenu>
      {collapsed ? null : bell}
    </div>
  );
}
