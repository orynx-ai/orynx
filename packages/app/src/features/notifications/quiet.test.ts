import { describe, expect, it } from 'vitest';
import { defaultNotificationSettings, type NotificationWhat } from '@devhub/contracts';
import { delivery, inQuietHours, pausedNow, pauseUntil } from './quiet.ts';

const session = { id: '00000000000000aa', title: 'Add bulk archive', source: null };
const approval: NotificationWhat = {
  kind: 'approval',
  session,
  approvalId: 'call-1',
  about: 'command',
  command: 'npm test',
  waiting: true,
};
const finished: NotificationWhat = { kind: 'session_finished', session, ready: 'pull_request' };
const awake = { ...defaultNotificationSettings, quietHours: { ...defaultNotificationSettings.quietHours, on: false } };

describe('Do not disturb (spec 029)', () => {
  const now = new Date(2026, 9, 19, 14, 0);

  it('AC-40: Pause now ends in an hour, at 9:00 tomorrow, or never', () => {
    expect(pauseUntil('hour', now)).toBe(new Date(2026, 9, 19, 15, 0).toISOString());
    expect(pauseUntil('tomorrow', now)).toBe(new Date(2026, 9, 20, 9, 0).toISOString());
    expect(pauseUntil('until_off', now)).toBeNull();
  });

  it('AC-31: holds while on and before its end, and turns itself off after', () => {
    const until = new Date(2026, 9, 19, 15, 0).toISOString();
    expect(pausedNow({ on: true, length: 'hour', until }, now)).toBe(true);
    expect(pausedNow({ on: true, length: 'hour', until }, new Date(2026, 9, 19, 15, 0))).toBe(false);
    expect(pausedNow({ on: true, length: 'until_off', until: null }, now)).toBe(true);
    expect(pausedNow({ on: false, length: 'until_off', until: null }, now)).toBe(false);
  });
});

describe('quiet hours (spec 029)', () => {
  const weeknights = { on: true, from: '19:00', to: '09:00', days: [true, true, true, true, true, false, false] };

  it('AC-30: hours that cross midnight belong to the day they start', () => {
    // 23 Oct 2026 is a Friday.
    expect(inQuietHours(weeknights, new Date(2026, 9, 23, 23, 0))).toBe(true);
    expect(inQuietHours(weeknights, new Date(2026, 9, 24, 8, 0))).toBe(true);
    expect(inQuietHours(weeknights, new Date(2026, 9, 24, 20, 0))).toBe(false);
    expect(inQuietHours(weeknights, new Date(2026, 9, 26, 8, 59))).toBe(false);
    expect(inQuietHours(weeknights, new Date(2026, 9, 26, 19, 0))).toBe(true);
    expect(inQuietHours(weeknights, new Date(2026, 9, 23, 12, 0))).toBe(false);
  });

  it('AC-30: hours within one day hold only then, on the chosen days', () => {
    const lunch = { on: true, from: '12:00', to: '13:00', days: [true, false, false, false, false, false, false] };
    expect(inQuietHours(lunch, new Date(2026, 9, 19, 12, 30))).toBe(true);
    expect(inQuietHours(lunch, new Date(2026, 9, 19, 13, 0))).toBe(false);
    expect(inQuietHours(lunch, new Date(2026, 9, 20, 12, 30))).toBe(false);
    expect(inQuietHours({ ...lunch, on: false }, new Date(2026, 9, 19, 12, 30))).toBe(false);
  });
});

describe('how a notification reaches you (spec 029)', () => {
  const noon = new Date(2026, 9, 19, 12, 0);

  it('AC-23, AC-28: follows its row: an approval pops up, shows on the desktop and knocks', () => {
    expect(delivery(approval, awake, noon)).toEqual({ popUp: true, desktop: true, sound: 'knock' });
    expect(delivery(finished, awake, noon)).toEqual({ popUp: true, desktop: true, sound: 'chime' });
  });

  it('AC-26, AC-28: the switches, and a row off or with no sound, turn each one off', () => {
    expect(delivery(finished, { ...awake, popUps: false, sounds: false }, noon)).toEqual({
      popUp: false,
      desktop: true,
      sound: null,
    });
    const rowOff = {
      ...awake,
      events: { ...awake.events, session_finished: { popUp: false, desktop: false, sound: 'none' as const } },
    };
    expect(delivery(finished, rowOff, noon)).toEqual({ popUp: false, desktop: false, sound: null });
  });

  it('AC-29: Do not disturb pauses everything, but an approval breaks through when asked to', () => {
    const paused = { ...awake, doNotDisturb: { on: true, length: 'until_off' as const, until: null } };
    expect(delivery(finished, paused, noon)).toEqual({ popUp: false, desktop: false, sound: null });
    expect(delivery(approval, paused, noon)).toEqual({ popUp: true, desktop: true, sound: 'knock' });
    expect(delivery(approval, { ...paused, approvalsBreakThrough: false }, noon)).toEqual({
      popUp: false,
      desktop: false,
      sound: null,
    });
  });

  it('AC-30: quiet hours pause as Do not disturb does', () => {
    expect(delivery(finished, defaultNotificationSettings, new Date(2026, 9, 19, 22, 0))).toEqual({
      popUp: false,
      desktop: false,
      sound: null,
    });
  });
});
