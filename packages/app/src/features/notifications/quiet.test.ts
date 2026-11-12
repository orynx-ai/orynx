import { describe, expect, it } from 'vitest';
import { pauseUntil } from './quiet.ts';

describe('Do not disturb (spec 029)', () => {
  const now = new Date(2026, 9, 19, 14, 0);

  it('AC-40: Pause now ends in an hour, at 9:00 tomorrow, or never', () => {
    expect(pauseUntil('hour', now)).toBe(new Date(2026, 9, 19, 15, 0).toISOString());
    expect(pauseUntil('tomorrow', now)).toBe(new Date(2026, 9, 20, 9, 0).toISOString());
    expect(pauseUntil('until_off', now)).toBeNull();
  });
});
