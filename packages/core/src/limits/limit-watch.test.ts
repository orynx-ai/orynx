import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeLimit, ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createLimitWatch } from './limit-watch.ts';

const resetsAt = '2026-11-10T15:40:00.000Z';
const warning: ClaudeLimit = { window: 'five_hour', usedPercent: 82, resetsAt };

function watch() {
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const told: ClaudeLimit[] = [];
  const limits = createLimitWatch({ events, notify: (limit) => told.push(limit) });
  return { limits, heard, told };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-10T14:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("how close you are to Claude's limit (spec 057, E)", () => {
  it('AC-45: a warning shows in status and tells you once', () => {
    const { limits, heard, told } = watch();
    limits.heard('allowed_warning', warning);

    expect(limits.current()).toEqual(warning);
    expect(heard).toEqual([{ type: 'status.changed' }]);
    expect(told).toEqual([warning]);
  });

  it('AC-46: another warning in the same window updates the number, and tells you nothing more', () => {
    const { limits, told } = watch();
    limits.heard('allowed_warning', warning);
    limits.heard('allowed_warning', { ...warning, usedPercent: 91 });

    expect(limits.current()).toMatchObject({ usedPercent: 91 });
    expect(told).toHaveLength(1);
  });

  it('AC-47: the warning goes when its window resets, or when Claude Code says all is well', () => {
    const { limits, heard } = watch();
    limits.heard('allowed_warning', warning);
    vi.advanceTimersByTime(100 * 60_000);
    expect(limits.current()).toBeNull();
    expect(heard).toEqual([{ type: 'status.changed' }, { type: 'status.changed' }]);

    limits.heard('allowed_warning', { ...warning, resetsAt: '2026-11-10T20:40:00.000Z' });
    limits.heard('allowed', { ...warning, usedPercent: 10 });
    expect(limits.current()).toBeNull();
    limits.close();
  });

  it('says nothing for a limit outside the plan’s windows, or an all-is-well with nothing showing', () => {
    const { limits, heard, told } = watch();
    limits.heard('allowed_warning', null);
    limits.heard('allowed', null);
    expect(heard).toEqual([]);
    expect(told).toEqual([]);
  });
});
