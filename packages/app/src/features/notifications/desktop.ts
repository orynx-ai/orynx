/**
 * The browser's own say on desktop notifications (spec 029, AC-34). Each browser keeps it, so it isn't one of the
 * saved settings. A browser without the Notification API counts as blocked.
 */
export type DesktopPermission = 'granted' | 'default' | 'denied';

export function desktopPermission(): DesktopPermission {
  return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
}

/** Asks the browser, which needs a click to ask; answers with what it now says. */
export async function askDesktopPermission(): Promise<DesktopPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.requestPermission();
}
