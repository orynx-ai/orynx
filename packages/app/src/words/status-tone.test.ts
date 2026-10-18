import { describe, expect, it } from 'vitest';
import { statusTones } from './status-tone.ts';

describe('statusTones (specs 008 and 013)', () => {
  it('AC-11: the list’s status pill takes its column’s colour', () => {
    expect(statusTones).toEqual({ to_do: 'neutral', in_progress: 'warning', in_review: 'info', done: 'success' });
  });
});
