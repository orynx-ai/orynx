import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchUpdates, type UpdateState, type Updater, type WatchedUpdates } from './updates.ts';

/** A stand-in for electron-updater's autoUpdater, which talks to GitHub Releases: an outside service. */
class FakeUpdater extends EventEmitter implements Updater {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  checks = 0;
  feed: unknown = null;
  requestHeaders: Record<string, string> | null = null;

  checkForUpdates(): Promise<null> {
    this.checks += 1;
    return Promise.resolve(null);
  }

  setFeedURL(options: unknown): void {
    this.feed = options;
  }
}

/** electron-updater's error for an HTTP answer such as a private repo's 404. */
class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`HttpError: ${String(statusCode)}`);
    this.statusCode = statusCode;
  }
}

let updater: FakeUpdater;
let told: UpdateState[];
let restarts: number;
let logged: string[];
let watched: WatchedUpdates;

function watch(platform: NodeJS.Platform, feedUrl: string | null = null): void {
  watched = watchUpdates({
    updater,
    platform,
    feedUrl,
    tell: (state) => {
      told.push(state);
    },
    restart: () => {
      restarts += 1;
    },
    log: (line) => {
      logged.push(line);
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  updater = new FakeUpdater();
  told = [];
  restarts = 0;
  logged = [];
});

afterEach(() => {
  watched.stop();
  vi.useRealTimers();
});

describe('watchUpdates (spec 045)', () => {
  it('AC-18, AC-19: on Linux, downloads on its own and tells the hub how far it has got, with no dialog', async () => {
    watch('linux');
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.checks).toBe(1);
    expect(updater.autoDownload).toBe(true);
    // The AppImage still installs a downloaded update when you quit (spec 027).
    expect(updater.autoInstallOnAppQuit).toBe(true);

    updater.emit('update-available', { version: '0.1.40' });
    updater.emit('update-downloaded', { version: '0.1.40' });
    expect(told).toEqual([
      { type: 'update-state', action: 'none', update: { state: 'idle' } },
      { type: 'update-state', action: 'none', update: { state: 'downloading', version: '0.1.40' } },
      { type: 'update-state', action: 'none', update: { state: 'ready', version: '0.1.40' } },
    ]);

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(updater.checks).toBe(2);
  });

  it('AC-19, AC-22: Restart to update restarts only once the update is ready', () => {
    watch('linux');
    watched.command({ type: 'restart' });
    expect(restarts).toBe(0);

    updater.emit('update-downloaded', { version: '0.1.40' });
    watched.command({ type: 'restart' });
    expect(restarts).toBe(1);
  });

  it('AC-23: a download that fails says so to the hub and logs why; a failed check only logs', () => {
    watch('linux');
    // electron-updater's own words for a private repo's feed, with the 404 inside.
    updater.emit(
      'error',
      new Error(
        'Cannot find channel "latest-linux.yml" update info: HttpError: 404 Not Found\n"method: GET url: https://github.com/orynx-ai/orynx/releases/download/v0.1.38/latest-linux.yml"',
      ),
    );
    updater.emit('error', new HttpError(502));
    expect(told).toHaveLength(1);

    updater.emit('update-available', { version: '0.1.40' });
    updater.emit('error', new Error('sha512 checksum mismatch, expected abc, got def'));
    expect(told.at(-1)).toEqual({ type: 'update-state', action: 'none', update: { state: 'failed', log: null } });
    expect(logged).toEqual([
      "Orynx couldn't check for updates (404).",
      "Orynx couldn't check for updates (502).",
      "Orynx couldn't check for updates (sha512 checksum mismatch, expected abc, got def).",
    ]);
  });

  it('AC-23: on Linux, Try again after a failed download checks again, which downloads it again', async () => {
    watch('linux');
    await vi.advanceTimersByTimeAsync(0);
    watched.command({ type: 'download', version: '0.1.40' });
    expect(updater.checks).toBe(1);

    updater.emit('update-available', { version: '0.1.40' });
    updater.emit('error', new Error('net::ERR_CONNECTION_RESET'));
    watched.command({ type: 'download', version: '0.1.40' });
    expect(updater.checks).toBe(2);
  });

  it('AC-21: on a Mac, offers Download until it can update itself, and never asks electron-updater', async () => {
    watch('darwin');
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.checks).toBe(0);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(told).toEqual([{ type: 'update-state', action: 'download', update: { state: 'idle' } }]);
  });

  it("logs a message from the hub it can't read, and does nothing", () => {
    watch('linux');
    updater.emit('update-downloaded', { version: '0.1.40' });
    watched.command({ type: 'restart-now' });
    watched.command('restart');
    expect(restarts).toBe(0);
    expect(logged).toEqual([
      "Orynx couldn't read a message from its hub.",
      "Orynx couldn't read a message from its hub.",
    ]);
  });

  it('AC-24 (spec 027): asks GitHub Releases with no token or header, or the feed a test names', () => {
    watch('linux');
    expect(updater.feed).toBeNull();
    expect(updater.requestHeaders).toBeNull();
    watched.stop();

    updater = new FakeUpdater();
    watch('linux', 'http://127.0.0.1:4555/releases');
    expect(updater.feed).toEqual({ provider: 'generic', url: 'http://127.0.0.1:4555/releases' });
    expect(updater.requestHeaders).toBeNull();
  });
});
