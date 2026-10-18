import { describe, expect, it } from 'vitest';
import { hour, minute } from './calendar.ts';
import { durationText } from './duration.ts';

describe('durationText', () => {
  it('AC-4 (spec 011): writes Claude’s working time as session.html does', () => {
    expect(durationText(4 * minute + 12_000)).toBe('4 min 12 s');
  });

  it('says seconds alone under a minute, and 0 s at the start', () => {
    expect(durationText(0)).toBe('0 s');
    expect(durationText(999)).toBe('0 s');
    expect(durationText(42_000)).toBe('42 s');
  });

  it('keeps the seconds on a whole minute', () => {
    expect(durationText(minute)).toBe('1 min 0 s');
  });

  it('says hours and minutes past an hour', () => {
    expect(durationText(hour + 4 * minute + 30_000)).toBe('1 h 4 min');
  });

  it('never goes below zero when the laptop’s clock is behind the server’s', () => {
    expect(durationText(-5_000)).toBe('0 s');
  });
});
