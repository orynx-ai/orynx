import { useId, type ComponentProps, type ReactNode } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { Popover } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import { NotificationBell, type NotificationBellProps } from './notification-bell.tsx';
import { Skeleton } from './skeleton.tsx';
import { Tabs, TabsContent, TabsList } from './tabs.tsx';

/**
 * Design system: the bell's panel (`dh-popover` around `dh-notif`s, spec 029). Radix Popover: Esc, Close or a click
 * outside closes it, and focus goes back to the bell. The page fills it: `<NotificationTabs>` with its list and
 * contents, `<NotificationGroup>`s of `NotificationItem`s, and the foot's switches.
 */
export function NotificationPanel(props: ComponentProps<typeof Popover.Root>) {
  return <Popover.Root {...props} />;
}

/** The bell, as the panel's trigger. */
export function NotificationPanelTrigger(props: NotificationBellProps) {
  return (
    <Popover.Trigger asChild aria-haspopup="dialog">
      <NotificationBell {...props} />
    </Popover.Trigger>
  );
}

export type NotificationPanelContentProps = ComponentProps<typeof Popover.Content> & {
  /** Buttons before Close in the head: Mark all read, Notification settings. */
  actions?: ReactNode;
  /** The panel's foot: Do not disturb, Sounds, All settings. */
  foot?: ReactNode;
};

/**
 * The panel itself: 372 px, never wider or taller than the window allows, at most 600 px tall, with its list
 * scrolling between the head and the foot. It opens beside the sidebar's foot by default, its bottom level with
 * the bell (the user's call: the bell sits at the bottom); pass `side` and `align` to open it elsewhere.
 */
export function NotificationPanelContent({
  actions,
  foot,
  className,
  children,
  side = 'right',
  align = 'end',
  ...props
}: NotificationPanelContentProps) {
  const headingId = useId();
  return (
    <Popover.Portal>
      <Popover.Content
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={16}
        aria-labelledby={headingId}
        className={cn(
          'z-50 flex max-h-(--radix-popover-content-available-height) w-93 max-w-(--radix-popover-content-available-width) origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-md border border-border bg-raised text-foreground shadow-overlay',
          'motion-safe:data-[state=closed]:animate-menu-out motion-safe:data-[state=open]:animate-menu-in',
          className,
        )}
        {...props}
      >
        <div className="flex max-h-150 min-h-0 flex-col">
          <div className="flex items-center gap-1 ps-3.5 pe-2 pt-2.5">
            <h2 id={headingId} className="flex-1 font-medium">
              Notifications
            </h2>
            {actions}
            <Popover.Close asChild>
              <IconButton variant="ghost" size="sm" label="Close">
                <Icon icon={Cancel01Icon} aria-hidden />
              </IconButton>
            </Popover.Close>
          </div>
          {children}
          {foot === undefined ? null : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3.5 py-2.5 text-small">
              {foot}
            </div>
          )}
        </div>
      </Popover.Content>
    </Popover.Portal>
  );
}

/** All and Needs you: the panel's tabs, whose contents scroll between the head and the foot. */
export function NotificationTabs({ className, ...props }: ComponentProps<typeof Tabs>) {
  return <Tabs className={cn('flex min-h-0 flex-1 flex-col', className)} {...props} />;
}

export function NotificationTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
  return <TabsList className={cn('shrink-0 gap-5 px-3.5', className)} {...props} />;
}

export function NotificationTabsContent({ className, ...props }: ComponentProps<typeof TabsContent>) {
  return <TabsContent className={cn('min-h-0 flex-1 overflow-y-auto', className)} {...props} />;
}

/** Today, or Earlier: a heading on the sidebar's colour, then its notifications. */
export function NotificationGroup({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-border first:border-t-0">
      <h3 id={id} className="bg-sidebar px-3.5 pt-2.5 pb-1 text-label font-medium text-muted-foreground">
        {heading}
      </h3>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

/** Three rows the size of real ones while the list is on its way. */
export function NotificationPanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Notifications loading" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, row) => (
        <li key={row} className="flex gap-2.5 px-3.5 py-3">
          <Skeleton shape="circle" className="size-7" />
          <span className="flex flex-1 flex-col gap-1.5 py-0.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-16" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One plain line in place of the list: nothing yet, nothing waiting, or why it didn't load, with its button. */
export function NotificationPanelNote({
  children,
  action,
  role,
}: {
  children: ReactNode;
  action?: ReactNode;
  role?: 'alert';
}) {
  return (
    <div
      role={role}
      className="flex flex-col items-center gap-3 px-3.5 py-10 text-center text-small text-muted-foreground"
    >
      <p>{children}</p>
      {action}
    </div>
  );
}
