import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { defaultNotificationSettings, type Notification, type NotificationSettings } from '@devhub/contracts';
import { makeNotification } from '@devhub/contracts/testing';
import { FakeAudioContext } from '../../test/fake-audio-context.ts';
import { FakeLocks, FakeNotification, installLocks } from '../../test/fake-notifications.ts';
import { announce, becomeSpeaker, someoneLooking, watchLooking } from './alerts.ts';

const noon = new Date(2026, 9, 19, 12, 0);
const awake: NotificationSettings = {
  ...defaultNotificationSettings,
  quietHours: { ...defaultNotificationSettings.quietHours, on: false },
};
const session = {
  id: '00000000000000aa',
  title: 'Add bulk archive',
  source: { kind: 'jira' as const, key: 'PROJ-1423' },
};
const approval = makeNotification({
  id: 'approval',
  what: {
    kind: 'approval',
    session,
    approvalId: 'call-1',
    about: 'command',
    command: 'npm test -- secret-flag',
    waiting: true,
  },
});
const finished = makeNotification({ id: 'finished', what: { kind: 'session_finished', session } });

let uninstall: () => void;
let hasFocus: MockInstance<() => boolean>;

beforeEach(() => {
  FakeAudioContext.reset();
  FakeNotification.reset();
  uninstall = installLocks(new FakeLocks());
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Notification', FakeNotification);
  hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('one tab speaks for all (spec 029)', () => {
  it('AC-27, AC-28: only the first tab to ask speaks; the next takes over when it closes', async () => {
    const first = new AbortController();
    const spoken: string[] = [];
    becomeSpeaker(() => spoken.push('first'), first.signal);
    becomeSpeaker(() => spoken.push('second'), new AbortController().signal);
    await Promise.resolve();
    expect(spoken).toEqual(['first']);

    first.abort();

    await vi.waitFor(() => {
      expect(spoken).toEqual(['first', 'second']);
    });
  });

  it('AC-27: knows whether you’re looking at any Orynx tab', async () => {
    const tab = new AbortController();
    watchLooking(tab.signal);
    expect(await someoneLooking()).toBe(false);

    hasFocus.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(async () => {
      expect(await someoneLooking()).toBe(true);
    });

    hasFocus.mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    await vi.waitFor(async () => {
      expect(await someoneLooking()).toBe(false);
    });
    tab.abort();
  });
});

describe('announcing what arrived (spec 029)', () => {
  it('AC-28: plays one sound for what arrived together, the first one’s', async () => {
    await announce([approval, finished], awake, noon, () => undefined);

    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]?.played.map((note) => note.frequency)).toEqual([392, 392]);
  });

  it('AC-27: shows each on the desktop with its title and session, never the command', async () => {
    await announce([approval], awake, noon, () => undefined);

    expect(FakeNotification.shown.map(({ title, options }) => [title, options.body, options.tag])).toEqual([
      ['Claude wants to run a command', 'PROJ-1423 · Add bulk archive', 'approval'],
    ]);
  });

  it('AC-27: clicking one brings Orynx forward and opens its place', async () => {
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    const opened: Notification[] = [];
    await announce([finished], awake, noon, (notification) => opened.push(notification));

    FakeNotification.shown[0]?.onclick?.();

    expect(focus).toHaveBeenCalledOnce();
    expect(opened).toEqual([finished]);
    expect(FakeNotification.shown[0]?.closed).toBe(true);
  });

  it('AC-27: none while you’re looking at Orynx, unless asked to show them anyway', async () => {
    hasFocus.mockReturnValue(true);
    watchLooking(new AbortController().signal);
    await vi.waitFor(async () => {
      expect(await someoneLooking()).toBe(true);
    });

    await announce([finished], awake, noon, () => undefined);
    expect(FakeNotification.shown).toEqual([]);

    await announce([finished], { ...awake, onlyInBackground: false }, noon, () => undefined);
    expect(FakeNotification.shown).toHaveLength(1);
  });

  it('AC-27: none without the browser’s permission, or with Desktop off', async () => {
    FakeNotification.permission = 'default';
    await announce([finished], awake, noon, () => undefined);
    FakeNotification.permission = 'granted';
    await announce([finished], { ...awake, desktop: false }, noon, () => undefined);

    expect(FakeNotification.shown).toEqual([]);
  });

  it('AC-29: Do not disturb keeps both back, except an approval that breaks through; a read one is never announced', async () => {
    const paused = { ...awake, doNotDisturb: { on: true, length: 'until_off' as const, until: null } };
    await announce([finished], paused, noon, () => undefined);
    expect(FakeAudioContext.instances).toEqual([]);
    expect(FakeNotification.shown).toEqual([]);

    await announce([{ ...finished, read: true }], awake, noon, () => undefined);
    expect(FakeNotification.shown).toEqual([]);

    await announce([approval], paused, noon, () => undefined);
    expect(FakeNotification.shown).toHaveLength(1);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});
