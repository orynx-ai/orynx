import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchUpdates, type Updater } from './updates.ts';

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
let shown: { message: string; buttons: string[] }[];
let answer: string;
let opened: number;
let logged: string[];
let stop: () => void;

function watch(platform: NodeJS.Platform, feedUrl: string | null = null): void {
  stop = watchUpdates({
    updater,
    platform,
    feedUrl,
    notify: (dialog) => {
      shown.push(dialog);
      return Promise.resolve(dialog.buttons.indexOf(answer));
    },
    openReleasePage: () => {
      opened += 1;
    },
    log: (line) => {
      logged.push(line);
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  updater = new FakeUpdater();
  shown = [];
  answer = 'Later';
  opened = 0;
  logged = [];
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('watchUpdates', () => {
  it('AC-24: on a Mac, checks at launch and every 6 hours, and never downloads', async () => {
    watch('darwin');
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.checks).toBe(1);
    expect(updater.autoDownload).toBe(false);

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(updater.checks).toBe(2);
  });

  it('AC-24: on a Mac, shows the notice once in a launch, and Download opens the release page', async () => {
    answer = 'Download';
    watch('darwin');

    updater.emit('update-available', { version: '0.1.38' });
    await vi.advanceTimersByTimeAsync(0);
    updater.emit('update-available', { version: '0.1.39' });
    await vi.advanceTimersByTimeAsync(0);

    expect(shown.map((dialog) => dialog.message)).toEqual(['Orynx 0.1.38 is out']);
    expect(opened).toBe(1);
  });

  it('AC-24: Later closes the notice and opens nothing', async () => {
    watch('darwin');

    updater.emit('update-available', { version: '0.1.38' });
    await vi.advanceTimersByTimeAsync(0);

    expect(shown).toHaveLength(1);
    expect(opened).toBe(0);
  });

  it('AC-25, AC-26: on Linux, downloads in the background, installs only on quit, and says so once', async () => {
    watch('linux');

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    updater.emit('update-available', { version: '0.1.38' });
    expect(shown).toEqual([]);

    updater.emit('update-downloaded', { version: '0.1.38' });
    updater.emit('update-downloaded', { version: '0.1.38' });
    await vi.advanceTimersByTimeAsync(0);

    expect(shown.map((dialog) => dialog.message)).toEqual(['Orynx 0.1.38 is ready']);
  });

  it('AC-23, AC-27, AC-28: a private repo, a bad download or no network shows nothing and only logs', async () => {
    watch('darwin');

    updater.emit('error', new HttpError(404));
    // electron-updater's own words for a private repo's feed, with the 404 inside.
    updater.emit(
      'error',
      new Error(
        'Cannot find channel "latest-mac.yml" update info: HttpError: 404 Not Found\n"method: GET url: https://github.com/masterghost2002/dev-hub/releases/download/v0.1.38/latest-mac.yml"\n\nPlease double check that your authentication token is correct.',
      ),
    );
    updater.emit('error', new Error('sha512 checksum mismatch, expected abc, got def'));
    updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
    await vi.advanceTimersByTimeAsync(0);

    expect(shown).toEqual([]);
    expect(logged).toEqual([
      "Orynx couldn't check for updates (404).",
      "Orynx couldn't check for updates (404).",
      "Orynx couldn't check for updates (sha512 checksum mismatch, expected abc, got def).",
      "Orynx couldn't check for updates (net::ERR_INTERNET_DISCONNECTED).",
    ]);
  });

  it('AC-29: asks GitHub Releases with no token or header, or the feed a test names', () => {
    watch('linux');
    expect(updater.feed).toBeNull();
    expect(updater.requestHeaders).toBeNull();
    stop();

    updater = new FakeUpdater();
    watch('linux', 'http://127.0.0.1:4555/releases');
    expect(updater.feed).toEqual({ provider: 'generic', url: 'http://127.0.0.1:4555/releases' });
    expect(updater.requestHeaders).toBeNull();
  });
});
