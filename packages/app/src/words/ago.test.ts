import { describe, expect, it } from 'vitest';
import { agoText } from './ago.ts';
import { day, hour, minute } from './calendar.ts';

describe('agoText', () => {
  it('says "just now" under a minute', () => {
    expect(agoText(0)).toBe('just now');
    expect(agoText(minute - 1)).toBe('just now');
  });

  it('AC-6 (spec 011): says minutes, hours or days ago, as "Started 4 min ago" needs', () => {
    expect(agoText(4 * minute)).toBe('4 min ago');
    expect(agoText(2 * hour)).toBe('2 h ago');
    expect(agoText(3 * day)).toBe('3 d ago');
  });
});
