import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createEventBus } from '../events/event-bus.ts';
import { createReleasesClient, releasesUrl } from '../integrations/releases/client.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createMemorySettingsStore, type SettingsStore } from '../settings/settings-store.ts';
import { answeringReleases, githubRelease, useFakeReleases } from '../test/fake-releases.ts';
import { fakeHost } from '../test/fake-update-host.ts';
import { createUpdateService, UpdateRefusedError, type UpdateHost } from './update-service.ts';

const server = useFakeReleases();
const releasesPath = releasesUrl.split('?')[0] ?? releasesUrl;
const minute = 60_000;

let asked: number;
let logged: string[];
let published: ServerEvent[];
let clock: number;
let stops: (() => void)[];

beforeEach(() => {
  asked = 0;
  told = [];
  logged = [];
  published = [];
  clock = Date.parse('2026-10-22T10:00:00.000Z');
  stops = [];
  server.events.on('request:start', () => {
    asked += 1;
  });
});

afterEach(() => {
  for (const stop of stops) stop();
  vi.useRealTimers();
});

let told: string[];

function service({
  host = fakeHost().host,
  sessions = createMemorySessionStore(),
  settings = createMemorySettingsStore(),
}: { host?: UpdateHost; sessions?: ReturnType<typeof createMemorySessionStore>; settings?: SettingsStore } = {}) {
  const events = createEventBus();
  events.subscribe((event) => published.push(event));
  return createUpdateService({
    host,
    releases: createReleasesClient(),
    sessions,
    settings,
    events,
    notify: (version) => told.push(version),
    log: (line) => logged.push(line),
    now: () => clock,
  });
}

describe('update service (spec 045)', () => {
  it('AC-6: with no newer release, says when GitHub last answered and marks yours', async () => {
    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.37' }), githubRelease({ tag_name: 'v0.1.36' })]));
    const updates = service();
    const answer = await updates.check();

    expect(answer).toMatchObject({ kind: 'desktop', checking: false, checkFailed: false, busy: false });
    expect(answer.checkedAt).toBe('2026-10-22T10:00:00.000Z');
    expect(answer.releases.map(({ version, newer, mine }) => ({ version, newer, mine }))).toEqual([
      { version: '0.1.37', newer: false, mine: true },
      { version: '0.1.36', newer: false, mine: false },
    ]);
  });

  it('AC-7, AC-14: a newer release is marked new, and a clone with no release tag finds every one newer', async () => {
    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.40' }), githubRelease({ tag_name: 'v0.1.37' })]));
    expect((await service().check()).releases.map((release) => release.newer)).toEqual([true, false]);

    const clone = fakeHost({ kind: 'service', running: { release: null, commits: 0, commit: 'abc1234' } }).host;
    clock += minute;
    expect((await service({ host: clone }).check()).releases.map((release) => release.newer)).toEqual([true, true]);
  });

  it('AC-8: says it is checking while GitHub is asked, and shares one ask between callers', async () => {
    let answer: () => void = () => undefined;
    server.use(
      http.get(releasesPath, async () => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return HttpResponse.json([]);
      }),
    );
    const updates = service();
    const first = updates.check();
    const second = updates.check();
    await vi.waitFor(() => {
      expect(asked).toBe(1);
    });
    expect((await updates.read()).checking).toBe(true);
    expect(published).toContainEqual({ type: 'updates.changed' });
    answer();
    expect((await first).checking).toBe(false);
    expect((await second).checking).toBe(false);
    expect(asked).toBe(1);
  });

  it('AC-9: asks GitHub at most once a minute, and the Checked time stays that of the last ask', async () => {
    const updates = service();
    await updates.check();
    clock += 59_000;
    const again = await updates.check();
    expect(asked).toBe(1);
    expect(again.checkedAt).toBe('2026-10-22T10:00:00.000Z');

    clock += 1000;
    expect((await updates.check()).checkedAt).toBe('2026-10-22T10:01:00.000Z');
    expect(asked).toBe(2);
  });

  it("AC-10: a failed check says so, keeps the last releases, and logs GitHub's reason", async () => {
    const updates = service();
    await updates.check();
    server.use(http.get(releasesPath, () => new HttpResponse(null, { status: 502 })));
    clock += minute;
    const failed = await updates.check();
    expect(failed).toMatchObject({ checkFailed: true, checkedAt: '2026-10-22T10:00:00.000Z' });
    expect(failed.releases).toHaveLength(1);
    expect(logged).toEqual(["Orynx couldn't check for updates (502)."]);

    server.use(
      http.get(releasesPath, () =>
        HttpResponse.json(
          {},
          { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1761130800' } },
        ),
      ),
    );
    clock += minute;
    await updates.check();
    expect(logged.at(-1)).toBe("Orynx couldn't check for updates (rate limited until 2025-10-22T11:00:00.000Z).");

    server.use(http.get(releasesPath, () => HttpResponse.error()));
    clock += minute;
    await updates.check();
    expect(logged.at(-1)).toBe("Orynx couldn't check for updates (unreachable).");

    server.use(answeringReleases([]));
    clock += minute;
    expect(await updates.check()).toMatchObject({ checkFailed: false, checkedAt: '2026-10-22T10:04:00.000Z' });
  });

  it('AC-11: with no releases, says none and nothing failed', async () => {
    server.use(answeringReleases([]));
    expect(await service().check()).toMatchObject({ releases: [], checkFailed: false });
  });

  it('AC-12: checks at start and every 6 hours, and never before it starts', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const updates = service();
    await updates.read();
    expect(asked).toBe(0);

    stops.push(updates.start());
    await vi.waitFor(() => {
      expect(asked).toBe(1);
    });
    clock += 6 * 60 * minute;
    await vi.advanceTimersByTimeAsync(6 * 60 * minute);
    await vi.waitFor(() => {
      expect(asked).toBe(2);
    });
  });

  it('AC-22, AC-29: a session working or waiting for you holds Update and Restart to update back', async () => {
    const { host, pressed, set } = fakeHost();
    for (const state of ['working', 'needs_you'] as const) {
      const sessions = createMemorySessionStore([makeSessionSummary({ state })]);
      const updates = service({ host, sessions });
      server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.40' })]));
      clock += minute;
      expect((await updates.check()).busy).toBe(true);
      await expect(updates.install('update')).rejects.toEqual(
        new UpdateRefusedError('session_working', 'Stop the running sessions first.'),
      );
      set({ state: 'ready', version: '0.1.40' });
      await expect(updates.install('restart')).rejects.toBeInstanceOf(UpdateRefusedError);
      set({ state: 'idle' });
    }
    const done = createMemorySessionStore([makeSessionSummary({ state: 'done' })]);
    expect((await service({ host, sessions: done }).read()).busy).toBe(false);
    expect(pressed).toEqual([]);
  });

  it('AC-19, AC-20, AC-25: Update hands the newest version to the host, and Restart to update waits until ready', async () => {
    const { host, pressed, set } = fakeHost();
    const updates = service({ host });
    stops.push(updates.start());
    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.40' }), githubRelease({ tag_name: 'v0.1.39' })]));
    clock += minute;
    await updates.check();

    await expect(updates.install('restart')).rejects.toMatchObject({ code: 'update_unavailable' });
    published.length = 0;
    expect((await updates.install('update')).update).toEqual({ state: 'downloading', version: '0.1.40' });
    expect(published).toContainEqual({ type: 'updates.changed' });
    // Pressed twice, it doesn't start again.
    await expect(updates.install('update')).rejects.toMatchObject({ code: 'update_unavailable' });

    set({ state: 'ready', version: '0.1.40' });
    await updates.install('restart');
    expect(pressed).toEqual(['update 0.1.40', 'restart']);
  });

  it('AC-30: there is nothing to install with no newer release, or in a clone started by hand', async () => {
    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.37' })]));
    const updates = service();
    await updates.check();
    await expect(updates.install('update')).rejects.toMatchObject({ code: 'update_unavailable' });

    const byHand = fakeHost({
      kind: 'by_hand',
      folder: '~/Code/orynx',
      state: () => ({ action: 'commands', update: { state: 'idle' } }),
    });
    const clone = service({ host: byHand.host });
    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.40' })]));
    clock += minute;
    expect(await clone.check()).toMatchObject({ kind: 'by_hand', folder: '~/Code/orynx', action: 'commands' });
    await expect(clone.install('update')).rejects.toMatchObject({ code: 'update_unavailable' });
    expect(byHand.pressed).toEqual([]);
  });

  it('AC-13: tells you once per newer version, remembered in settings.json, and never about your own', async () => {
    const settings = createMemorySettingsStore();
    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.37' })]));
    const updates = service({ settings });
    await updates.check();
    expect(told).toEqual([]);

    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.40' }), githubRelease({ tag_name: 'v0.1.39' })]));
    clock += minute;
    await updates.check();
    clock += minute;
    await updates.check();
    expect(told).toEqual(['0.1.40']);
    expect((await settings.read()).updates).toEqual({ told: '0.1.40' });

    // Orynx started again, as after Clear cache or a restart: the same version isn't told twice.
    clock += minute;
    await service({ settings }).check();
    expect(told).toEqual(['0.1.40']);

    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.41' })]));
    clock += minute;
    await updates.check();
    expect(told).toEqual(['0.1.40', '0.1.41']);
  });

  it('AC-23: Try again after a failed download asks the host again, even where the update downloads on its own', async () => {
    const linux = fakeHost({
      state: () => ({ action: 'none', update: { state: 'failed', log: '~/.devhub/logs/orynx.log' } }),
    });
    const updates = service({ host: linux.host });
    server.use(answeringReleases([githubRelease({ tag_name: 'v0.1.40' })]));
    await updates.check();
    await updates.install('update');
    expect(linux.pressed).toEqual(['update 0.1.40']);
  });
});
