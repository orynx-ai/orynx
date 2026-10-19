import { linuxUpdateDialog, macUpdateDialog, type Dialog } from './dialogs.ts';

/** The part of electron-updater's `autoUpdater` Orynx uses. */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  setFeedURL(options: { provider: 'generic'; url: string }): void;
  on(event: 'update-available' | 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface WatchUpdatesOptions {
  updater: Updater;
  platform: NodeJS.Platform;
  /** A test's fake releases server (DEVHUB_UPDATES_URL), or null for this repo's GitHub Releases. */
  feedUrl: string | null;
  /** Shows a dialog and resolves with the index of the button pressed. */
  notify: (dialog: Dialog) => Promise<number>;
  openReleasePage: () => void;
  log: (line: string) => void;
}

const everySixHours = 6 * 60 * 60 * 1000;

/**
 * Checks this repo's GitHub Releases at launch and every 6 hours, with no token (spec 027, AC-29). An
 * unsigned Mac can't install an update, so it only says one is out (AC-24); Linux's AppImage downloads it
 * and installs it on quit (AC-25). Orynx never restarts itself, so a session is never cut off (AC-26).
 * While the repo is private every check is a 404, which only goes in the log (AC-23). Returns a stop.
 */
export function watchUpdates({
  updater,
  platform,
  feedUrl,
  notify,
  openReleasePage,
  log,
}: WatchUpdatesOptions): () => void {
  const mac = platform === 'darwin';
  updater.autoDownload = !mac;
  updater.autoInstallOnAppQuit = !mac;
  if (feedUrl !== null) updater.setFeedURL({ provider: 'generic', url: feedUrl });

  let told = false;
  async function tell(dialog: Dialog): Promise<void> {
    if (told) return;
    told = true;
    const pressed = await notify(dialog);
    if (mac && dialog.buttons[pressed] === 'Download') openReleasePage();
  }
  if (mac) updater.on('update-available', ({ version }) => void tell(macUpdateDialog(version)));
  else updater.on('update-downloaded', ({ version }) => void tell(linuxUpdateDialog(version)));
  updater.on('error', (error) => {
    const status = 'statusCode' in error && typeof error.statusCode === 'number' ? String(error.statusCode) : null;
    log(`Orynx couldn't check for updates (${status ?? error.message}).`);
  });

  // A failed check also arrives as 'error' above; this only keeps its promise from going unhandled.
  const check = (): void => void updater.checkForUpdates().catch(() => undefined);
  check();
  const timer = setInterval(check, everySixHours);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
