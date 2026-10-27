import { z } from 'zod';

/** The part of electron-updater's `autoUpdater` Orynx uses. */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  setFeedURL(options: { provider: 'generic'; url: string }): void;
  on(event: 'update-available' | 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

const VersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

/**
 * What the app tells its hub (spec 045). The app imports no `@devhub` package, so this is its own copy of the hub's
 * `DesktopUpdateStateSchema` in @devhub/contracts; apps/server's bridge test keeps the two in step.
 */
export const UpdateStateSchema = z.object({
  type: z.literal('update-state'),
  action: z.enum(['update', 'download', 'none']),
  update: z.discriminatedUnion('state', [
    z.object({ state: z.literal('idle') }),
    z.object({ state: z.literal('downloading'), version: VersionSchema }),
    z.object({ state: z.literal('ready'), version: VersionSchema }),
    z.object({ state: z.literal('failed'), log: z.null() }),
  ]),
});
export type UpdateState = z.infer<typeof UpdateStateSchema>;

/** What the hub asks of the app: its `HubUpdateCommandSchema`, the same way. */
export const UpdateCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('download'), version: VersionSchema }),
  z.object({ type: z.literal('restart') }),
]);

export interface WatchUpdatesOptions {
  updater: Updater;
  platform: NodeJS.Platform;
  /** A test's fake releases server (DEVHUB_UPDATES_URL), or null for this repo's GitHub Releases. */
  feedUrl: string | null;
  /** Tells the hub how far an update has got; Settings › About shows it. */
  tell: (state: UpdateState) => void;
  /** Restart to update: stops the hub as Quit does, then installs and opens the new version. */
  restart: () => void;
  log: (line: string) => void;
}

export interface WatchedUpdates {
  /** A message from the hub: Update or Restart to update, pressed in Settings › About. */
  command(message: unknown): void;
  stop(): void;
}

const everySixHours = 6 * 60 * 60 * 1000;

/**
 * The HTTP status when there is one, else the error's first line. electron-updater wraps a private repo's
 * 404 in a long message of its own ("Cannot find channel … HttpError: 404 Not Found …") with no status field.
 */
function reason(error: Error): string {
  if ('statusCode' in error && typeof error.statusCode === 'number') return String(error.statusCode);
  return /HttpError: (\d{3})/.exec(error.message)?.[1] ?? error.message.split('\n')[0] ?? error.message;
}

/**
 * Electron's updater keeps its job (spec 027), and tells the hub what it is doing instead of showing a dialog of its
 * own (spec 045, Q5). Linux's AppImage downloads an update in the background, checking at launch and every 6 hours
 * with no token, and installs it on Restart to update or on quit. A Mac offers Download, which opens the release
 * page. Orynx never restarts without your click, so a session is never cut off.
 */
export function watchUpdates({ updater, platform, feedUrl, tell, restart, log }: WatchUpdatesOptions): WatchedUpdates {
  const mac = platform === 'darwin';
  updater.autoDownload = !mac;
  updater.autoInstallOnAppQuit = !mac;
  let state: UpdateState = { type: 'update-state', action: mac ? 'download' : 'none', update: { state: 'idle' } };
  const set = (update: UpdateState['update']): void => {
    state = { ...state, update };
    tell(state);
  };
  tell(state);

  const commands = {
    command(message: unknown) {
      const command = UpdateCommandSchema.safeParse(message);
      if (!command.success) {
        log("Orynx couldn't read a message from its hub.");
        return;
      }
      if (command.data.type === 'restart' && state.update.state === 'ready') restart();
    },
  };
  if (mac) return { ...commands, stop: () => undefined };

  if (feedUrl !== null) updater.setFeedURL({ provider: 'generic', url: feedUrl });
  updater.on('update-available', ({ version }) => {
    set({ state: 'downloading', version });
  });
  updater.on('update-downloaded', ({ version }) => {
    set({ state: 'ready', version });
  });
  updater.on('error', (error) => {
    log(`Orynx couldn't check for updates (${reason(error)}).`);
    if (state.update.state === 'downloading') set({ state: 'failed', log: null });
  });

  // A failed check also arrives as 'error' above; this only keeps its promise from going unhandled.
  const check = (): void => void updater.checkForUpdates().catch(() => undefined);
  check();
  const timer = setInterval(check, everySixHours);
  timer.unref();
  return {
    ...commands,
    stop: () => {
      clearInterval(timer);
    },
  };
}
