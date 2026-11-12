import { describe, expect, it } from 'vitest';
import { lastWorkingDay, standupText, type StandupFacts } from './standup-text.ts';

const nothing: StandupFacts = { merged: [], opened: [], moved: [], reviewed: [], finished: [], today: [], waiting: [] };

describe('the last working day (spec 057, AC-29)', () => {
  it('is the day before on a weekday, and Friday from Saturday to Monday, on the laptop’s clock', () => {
    // 10 Nov 2026 is a Tuesday.
    expect(lastWorkingDay(new Date(2026, 10, 10, 9, 0))).toBe('2026-11-09');
    expect(lastWorkingDay(new Date(2026, 10, 9, 0, 5))).toBe('2026-11-06');
    expect(lastWorkingDay(new Date(2026, 10, 8, 12, 0))).toBe('2026-11-06');
    expect(lastWorkingDay(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-06');
    expect(lastWorkingDay(new Date(2026, 0, 1, 9, 0))).toBe('2025-12-31');
  });
});

describe('the standup’s text (spec 057, AC-28, AC-30)', () => {
  it('AC-28: Yesterday lists what was merged, opened, moved and reviewed; Today what’s in progress and waiting', () => {
    const facts: StandupFacts = {
      merged: [{ number: 2974, title: 'Add bulk archive', ticket: 'PROJ-1423' }],
      opened: [{ number: 2980, title: 'Retry failed exports', ticket: null }],
      moved: [{ key: 'PROJ-1419', status: 'In Review' }],
      reviewed: [{ repository: 'acme/web', number: 2971 }],
      finished: [{ title: 'Tidy the README', ticket: 'PROJ-1402' }],
      today: [{ key: 'PROJ-1431', title: 'Retry failed exports', status: 'In Progress' }],
      waiting: [{ title: 'Add bulk archive' }],
    };
    expect(standupText(facts)).toBe(
      [
        'Yesterday',
        '• Merged #2974 Add bulk archive (PROJ-1423)',
        '• Opened #2980 Retry failed exports',
        '• Moved PROJ-1419 to In Review',
        '• Reviewed acme/web #2971',
        '• Finished Tidy the README (PROJ-1402)',
        '',
        'Today',
        '• PROJ-1431 Retry failed exports (In Progress)',
        '• Add bulk archive (Claude is waiting for you)',
        '',
        'Blockers',
        '• None',
      ].join('\n'),
    );
  });

  it('AC-30: nothing found says so, for you to fill in', () => {
    expect(standupText(nothing)).toBe(
      [
        'Yesterday',
        '• Nothing found. Add your own.',
        '',
        'Today',
        '• Nothing found. Add your own.',
        '',
        'Blockers',
        '• None',
      ].join('\n'),
    );
  });
});
