import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { defaultNotificationSettings, type Notification } from '@devhub/contracts';
import { Notification01Icon } from '@hugeicons/core-free-icons';
import { Toast, ToastRegion } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { announce, becomeSpeaker, watchLooking } from '../alerts.ts';
import { useMarkNotificationsRead, useNotificationSettings, useNotifications } from '../queries.ts';
import { delivery } from '../quiet.ts';
import { useTestPopUpStore } from '../store.ts';
import { aboutOpenSession, notificationPlace, notificationWords, testWords } from '../words.ts';
import { isWaiting, notificationLooks } from './notification-centre.tsx';
import { NotificationActions } from './notification-actions.tsx';

/** How long a pop-up stays, unless it's an approval or you're on it (AC-24). */
const stays = 8_000;
/** At most this many at once; more wait their turn (AC-25). */
const most = 3;

/**
 * Pop-ups (spec 029): a notification that comes while this tab is open pops up in the bottom-right corner, as
 * Settings › Notifications says. Those already there when the tab opened don't. Which are showing is this tab's
 * own; the notifications themselves come from the list. If this tab is the one that speaks for all, it also
 * sounds and raises desktop notifications (`alerts.ts`).
 */
export function PopUps() {
  const notifications = useNotifications();
  const settings = useNotificationSettings();
  const navigate = useNavigate();
  const platform = usePlatform();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const seen = useRef<Set<string> | null>(null);
  const speaking = useRef(false);
  const [queued, setQueued] = useState<readonly string[]>([]);

  useEffect(() => {
    const tab = new AbortController();
    becomeSpeaker(() => {
      speaking.current = true;
    }, tab.signal);
    watchLooking(tab.signal);
    return () => {
      speaking.current = false;
      tab.abort();
    };
  }, []);

  // Stable, so a pop-up's timer doesn't start again each time the list changes.
  const close = useCallback((id: string) => {
    setQueued((ids) => ids.filter((queuedId) => queuedId !== id));
  }, []);

  const { mutate: markRead } = useMarkNotificationsRead();
  const open = useCallback(
    (notification: Notification) => {
      close(notification.id);
      if (!notification.read) markRead({ ids: [notification.id] });
      const place = notificationPlace(notification.what);
      if (place.kind === 'session') {
        void navigate({ to: '/sessions/$sessionId', params: { sessionId: place.sessionId } });
      } else if (place.kind === 'about') {
        void navigate({ to: '/settings/$tab', params: { tab: 'about' } });
      } else platform.openExternal(place.url);
    },
    [close, markRead, navigate, platform],
  );

  const list = notifications.data?.notifications;
  useEffect(() => {
    if (list === undefined) return;
    if (seen.current === null) {
      // The first list this tab reads holds nothing new.
      seen.current = new Set(list.map((notification) => notification.id));
      return;
    }
    const known = seen.current;
    // Oldest first, so the newest lands at the bottom.
    const arrived = list.filter((notification) => !known.has(notification.id)).reverse();
    for (const notification of arrived) known.add(notification.id);
    const chosen = settings.data ?? defaultNotificationSettings;
    const now = new Date();
    const popping = arrived.filter(
      ({ read, what }) =>
        !read &&
        delivery(what, chosen, now).popUp &&
        // The session you're looking at already shows it, its approval callout included.
        !aboutOpenSession(what, pathname),
    );
    if (popping.length > 0) setQueued((ids) => [...ids, ...popping.map((notification) => notification.id)]);
    // Nor does it wait unread in the bell: the session you're on has told you (the user's call, 20 Oct 2026).
    const here = arrived.filter(({ read, what }) => !read && aboutOpenSession(what, pathname));
    if (here.length > 0) markRead({ ids: here.map((notification) => notification.id) });
    if (speaking.current && arrived.length > 0) void announce(arrived, chosen, now, open);
  }, [list, settings.data, open, pathname, markRead]);

  const byId = new Map((list ?? []).map((notification) => [notification.id, notification]));
  // An approval answered anywhere has nothing left to ask, so its pop-up goes (AC-23).
  const showing = queued
    .map((id) => byId.get(id))
    .filter((notification) => notification !== undefined)
    .filter((notification) => notification.what.kind !== 'approval' || isWaiting(notification))
    .slice(0, most);

  return (
    <ToastRegion>
      <TestPopUp />
      {showing.map((notification) => (
        <PopUp
          key={notification.id}
          notification={notification}
          onOpen={() => {
            open(notification);
          }}
          close={close}
          onAllowed={() => {
            close(notification.id);
            markRead({ ids: [notification.id] });
          }}
        />
      ))}
    </ToastRegion>
  );
}

function PopUp({
  notification,
  onOpen,
  close,
  onAllowed,
}: {
  notification: Notification;
  onOpen: () => void;
  close: (id: string) => void;
  onAllowed: () => void;
}) {
  const waiting = isWaiting(notification);
  const [held, setHeld] = useState({ pointer: false, focus: false });
  const words = notificationWords(notification.what);

  useEffect(() => {
    // An approval stays until it's answered or closed; anything else goes, unless you're on it.
    if (waiting || held.pointer || held.focus) return;
    const timer = setTimeout(() => {
      close(notification.id);
    }, stays);
    return () => {
      clearTimeout(timer);
    };
  }, [waiting, held, close, notification.id]);

  return (
    <Toast
      {...notificationLooks[notification.what.kind]}
      role={waiting ? 'alert' : 'status'}
      title={words.title}
      detail={words.detail}
      onOpen={onOpen}
      onClose={() => {
        close(notification.id);
      }}
      onMouseEnter={() => {
        setHeld((was) => ({ ...was, pointer: true }));
      }}
      onMouseLeave={() => {
        setHeld((was) => ({ ...was, pointer: false }));
      }}
      onFocus={() => {
        setHeld((was) => ({ ...was, focus: true }));
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld((was) => ({ ...was, focus: false }));
      }}
      {...(waiting
        ? { actions: <NotificationActions notification={notification} onReview={onOpen} onAllowed={onAllowed} /> }
        : {})}
    />
  );
}

/** Send a test notification's pop-up, as a finished session's goes: after 8 seconds (AC-42). */
function TestPopUp() {
  const shown = useTestPopUpStore((state) => state.shown);
  const hide = useTestPopUpStore((state) => state.hide);

  useEffect(() => {
    if (shown === 0) return;
    const timer = setTimeout(hide, stays);
    return () => {
      clearTimeout(timer);
    };
  }, [shown, hide]);

  if (shown === 0) return null;
  return (
    <Toast
      key={shown}
      icon={Notification01Icon}
      tone="neutral"
      role="status"
      title={testWords.title}
      detail={testWords.detail}
      onOpen={hide}
      onClose={hide}
    />
  );
}
