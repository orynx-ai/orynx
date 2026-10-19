import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert02Icon, GitPullRequestIcon, PauseIcon, Ticket01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import type { Notification, NotificationKind } from '@devhub/contracts';
import {
  Button,
  NotificationGroup,
  NotificationItem,
  NotificationPanel,
  NotificationPanelContent,
  NotificationPanelNote,
  NotificationPanelSkeleton,
  NotificationPanelTrigger,
  NotificationTabs,
  NotificationTabsContent,
  NotificationTabsList,
  TabsTrigger,
  type IconSvgElement,
  type NotificationTone,
  type TooltipProps,
} from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { useNow } from '../../../words/use-now.ts';
import { useMarkNotificationsRead, useNotifications } from '../queries.ts';
import { NotificationActions } from './notification-actions.tsx';
import { notificationGroups, notificationPlace, notificationTime, notificationWords } from '../words.ts';

/** Each kind's icon and tone, beside words that say the same. */
export const notificationLooks: Record<NotificationKind, { icon: IconSvgElement; tone: NotificationTone }> = {
  approval: { icon: Alert02Icon, tone: 'warning' },
  session_finished: { icon: Tick02Icon, tone: 'success' },
  session_stopped: { icon: PauseIcon, tone: 'neutral' },
  session_failed: { icon: Alert02Icon, tone: 'danger' },
  session_limit: { icon: Alert02Icon, tone: 'danger' },
  review_requested: { icon: GitPullRequestIcon, tone: 'neutral' },
  checks_failed: { icon: Alert02Icon, tone: 'danger' },
  jira_assigned: { icon: Ticket01Icon, tone: 'neutral' },
};

/** Still waiting on you: an approval nobody has answered (Needs you). */
export function isWaiting({ what }: Notification): boolean {
  return what.kind === 'approval' && what.waiting;
}

export interface NotificationCentreProps {
  /** Where the panel opens: beside the sidebar's foot by default, below the narrow top bar's bell. */
  side?: 'right' | 'bottom';
  tooltipSide?: TooltipProps['side'];
}

/** The bell and its panel (spec 029). The bell sits at the bottom of the sidebar: the user's change to the design. */
export function NotificationCentre({ side = 'right', tooltipSide }: NotificationCentreProps) {
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const platform = usePlatform();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const unread = notifications.data?.unread ?? 0;

  function openNotification(notification: Notification) {
    setOpen(false);
    if (!notification.read) markRead.mutate({ ids: [notification.id] });
    const place = notificationPlace(notification.what);
    if (place.kind === 'session') void navigate({ to: '/sessions/$sessionId', params: { sessionId: place.sessionId } });
    else platform.openExternal(place.url);
  }

  function list(shown: readonly Notification[], empty: string) {
    if (notifications.isPending) return <NotificationPanelSkeleton />;
    if (notifications.isError) {
      return (
        <NotificationPanelNote
          role="alert"
          action={
            <Button size="sm" variant="secondary" onClick={() => void notifications.refetch()}>
              Try again
            </Button>
          }
        >
          Notifications didn’t load.
        </NotificationPanelNote>
      );
    }
    if (shown.length === 0) return <NotificationPanelNote>{empty}</NotificationPanelNote>;
    return notificationGroups(shown, now).map((group) => (
      <NotificationGroup key={group.heading} heading={group.heading}>
        {group.notifications.map((notification) => {
          const words = notificationWords(notification.what);
          return (
            <NotificationItem
              key={notification.id}
              {...notificationLooks[notification.what.kind]}
              title={words.title}
              detail={words.detail}
              time={notificationTime(notification.at, now)}
              unread={!notification.read}
              onOpen={() => {
                openNotification(notification);
              }}
              {...(isWaiting(notification)
                ? {
                    actions: (
                      <NotificationActions
                        notification={notification}
                        onReview={() => {
                          openNotification(notification);
                        }}
                        onAllowed={() => {
                          if (!notification.read) markRead.mutate({ ids: [notification.id] });
                        }}
                      />
                    ),
                  }
                : {})}
            />
          );
        })}
      </NotificationGroup>
    ));
  }

  const all = notifications.data?.notifications ?? [];
  const waiting = all.filter(isWaiting);

  return (
    <NotificationPanel open={open} onOpenChange={setOpen}>
      <NotificationPanelTrigger unread={unread} tooltipSide={tooltipSide} />
      <NotificationPanelContent
        side={side}
        align="end"
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={unread === 0}
            onClick={() => {
              markRead.mutate({ all: true });
            }}
          >
            Mark all read
          </Button>
        }
      >
        <NotificationTabs value={tab} onValueChange={setTab}>
          <NotificationTabsList>
            <TabsTrigger value="all" {...(unread > 0 ? { count: unread } : {})}>
              All
            </TabsTrigger>
            <TabsTrigger value="needs-you" {...(waiting.length > 0 ? { count: waiting.length } : {})}>
              Needs you
            </TabsTrigger>
          </NotificationTabsList>
          <NotificationTabsContent value="all">{list(all, 'No notifications yet.')}</NotificationTabsContent>
          <NotificationTabsContent value="needs-you">
            {list(waiting, 'Nothing is waiting for you.')}
          </NotificationTabsContent>
        </NotificationTabs>
      </NotificationPanelContent>
    </NotificationPanel>
  );
}
