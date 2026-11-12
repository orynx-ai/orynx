import { describe, expect, it } from 'vitest';
import { limitLine } from './claude-limit.ts';

// Tuesday 10 Nov 2026, 14:00 on the laptop's own clock.
const now = new Date(2026, 10, 10, 14, 0);

describe('how close you are to Claude’s limit (spec 057, AC-45)', () => {
  it('says the share used and the 5-hour window, resetting today at a time', () => {
    const resetsAt = new Date(2026, 10, 10, 15, 40).toISOString();
    expect(limitLine({ window: 'five_hour', usedPercent: 82, resetsAt }, now)).toBe(
      "You've used 82% of your 5-hour Claude limit. It resets at 3:40 pm.",
    );
  });

  it('says a weekly limit resets on its day, and says no time when Claude Code gave none', () => {
    const resetsAt = new Date(2026, 10, 12, 9, 0).toISOString();
    expect(limitLine({ window: 'seven_day_opus', usedPercent: 91, resetsAt }, now)).toBe(
      "You've used 91% of your weekly Claude limit. It resets Thursday at 9:00 am.",
    );
    expect(limitLine({ window: 'seven_day', usedPercent: 75, resetsAt: null }, now)).toBe(
      "You've used 75% of your weekly Claude limit.",
    );
    expect(
      limitLine({ window: 'five_hour', usedPercent: 80, resetsAt: new Date(2026, 10, 10, 0, 5).toISOString() }, now),
    ).toBe("You've used 80% of your 5-hour Claude limit. It resets at 12:05 am.");
  });
});
