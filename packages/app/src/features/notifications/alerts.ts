import type { Notification as OrynxNotification, NotificationSettings } from '@devhub/contracts';
import { desktopPermission } from './desktop.ts';
import { delivery } from './quiet.ts';
import { playSound } from './sounds.ts';
import { notificationWords } from './words.ts';

/**
 * Sounds and desktop notifications (spec 029). Every open tab shows its own pop-ups, but only one tab sounds and
 * raises desktop notifications, for all of them (AC-27, AC-28): the one holding this Web Lock, until it closes.
 */
const speakerLock = 'orynx-notify';
/** A tab you're looking at holds a lock under this prefix, which the speaking tab can see. */
const lookingPrefix = 'orynx-looking-';

function hasLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
}

/** Asks to be the tab that speaks; `onSpeaking` runs once it is. Gives the role back when `signal` aborts. */
export function becomeSpeaker(onSpeaking: () => void, signal: AbortSignal): void {
  // shortcut: a browser without Web Locks lets every tab speak, so two tabs would both sound; all current browsers have them.
  if (!hasLocks()) {
    onSpeaking();
    return;
  }
  navigator.locks
    .request(speakerLock, { signal }, () => {
      onSpeaking();
      return new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => {
          resolve();
        });
      });
    })
    .catch(() => undefined);
}

function lookingHere(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

/** Holds this tab's looking lock while it's the tab you're looking at, until `signal` aborts. */
export function watchLooking(signal: AbortSignal): void {
  if (!hasLocks()) return;
  const name = `${lookingPrefix}${crypto.randomUUID()}`;
  let release: (() => void) | null = null;
  const update = () => {
    if (lookingHere() && release === null && !signal.aborted) {
      void navigator.locks.request(
        name,
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
    } else if (!lookingHere() && release !== null) {
      release();
      release = null;
    }
  };
  update();
  for (const event of ['visibilitychange', 'focus', 'blur'] as const) {
    (event === 'visibilitychange' ? document : window).addEventListener(event, update, { signal });
  }
  signal.addEventListener('abort', () => {
    release?.();
  });
}

/** Whether you're looking at any Orynx tab now. */
export async function someoneLooking(): Promise<boolean> {
  if (!hasLocks()) return lookingHere();
  const { held = [] } = await navigator.locks.query();
  return held.some((lock) => lock.name?.startsWith(lookingPrefix) === true);
}

/**
 * From the speaking tab: one sound for what just arrived, and a desktop notification for each that asks for one
 * (AC-27, AC-28, AC-29). A desktop notification says the title and the ticket or pull request, never a command,
 * and clicking it brings Orynx forward and opens its place.
 */
export async function announce(
  arrived: readonly OrynxNotification[],
  settings: NotificationSettings,
  now: Date,
  open: (notification: OrynxNotification) => void,
): Promise<void> {
  const reaching = arrived
    .filter((notification) => !notification.read)
    .map((notification) => ({ notification, reach: delivery(notification.what, settings, now) }));
  const sound = reaching.find(({ reach }) => reach.sound !== null)?.reach.sound ?? null;
  if (sound !== null) playSound(sound, settings.volume);

  const desktop = reaching.filter(({ reach }) => reach.desktop);
  if (desktop.length === 0 || desktopPermission() !== 'granted') return;
  if (settings.onlyInBackground && (await someoneLooking())) return;
  for (const { notification } of desktop) {
    const words = notificationWords(notification.what);
    const shown = new Notification(words.title, { body: words.desktop, tag: notification.id });
    shown.onclick = () => {
      window.focus();
      open(notification);
      shown.close();
    };
  }
}
