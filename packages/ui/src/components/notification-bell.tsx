import { Notification01Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton, type IconButtonProps } from './icon-button.tsx';

export type NotificationBellProps = Omit<IconButtonProps, 'label' | 'children'> & {
  /** How many are unread: a red count over the bell, 99+ above 99, and none at 0. */
  unread: number;
};

/**
 * Design system: `dh-bell` with `dh-bell-count` (spec 029). A ghost icon button whose tooltip says "Notifications"
 * and whose name adds the count ("Notifications, 4 unread"). It passes every other prop on, so a popover can use it
 * as its trigger.
 */
export function NotificationBell({ unread, className, ...props }: NotificationBellProps) {
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label="Notifications"
      aria-label={unread > 0 ? `Notifications, ${String(unread)} unread` : 'Notifications'}
      className={cn('relative', className)}
      {...props}
    >
      <Icon icon={Notification01Icon} aria-hidden />
      {unread > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -end-1.5 -top-1 box-content flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-sidebar bg-danger px-1 text-label font-medium text-on-danger"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </IconButton>
  );
}
