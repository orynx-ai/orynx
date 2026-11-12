import { describe, expect, it } from 'vitest';
import { afterSync, nextToRead } from './queue.ts';

describe('which review requests wait to be read ahead (spec 057, D)', () => {
  it('AC-37: the first sync after turning it on only learns what was already waiting', () => {
    expect(afterSync({ queued: [], known: null }, ['acme/a#1', 'acme/a#2'])).toEqual({
      queued: [],
      known: ['acme/a#1', 'acme/a#2'],
    });
  });

  it('AC-35, AC-38: a request that arrives later joins the end of the queue, once', () => {
    const before = { queued: ['acme/a#3'], known: ['acme/a#1', 'acme/a#3'] };
    expect(afterSync(before, ['acme/a#1', 'acme/a#3', 'acme/a#4'])).toEqual({
      queued: ['acme/a#3', 'acme/a#4'],
      known: ['acme/a#1', 'acme/a#3', 'acme/a#4'],
    });
  });

  it('AC-40: a request withdrawn before its turn leaves the queue', () => {
    expect(afterSync({ queued: ['acme/a#3', 'acme/a#4'], known: ['acme/a#3', 'acme/a#4'] }, ['acme/a#4'])).toEqual({
      queued: ['acme/a#4'],
      known: ['acme/a#4'],
    });
  });
});

describe('what starts now (spec 057, Q6)', () => {
  const ready = { queued: ['acme/a#3', 'acme/a#4'], working: 0, reading: false, startedToday: 0 };

  it('AC-38: the oldest, when nothing is being read and fewer than 2 sessions work', () => {
    expect(nextToRead(ready)).toBe('acme/a#3');
    expect(nextToRead({ ...ready, working: 1 })).toBe('acme/a#3');
  });

  it('AC-38: none while one is being read, or while 2 or more sessions work', () => {
    expect(nextToRead({ ...ready, reading: true })).toBeNull();
    expect(nextToRead({ ...ready, working: 2 })).toBeNull();
  });

  it('AC-39: none once 5 have started today, and none with nothing queued', () => {
    expect(nextToRead({ ...ready, startedToday: 5 })).toBeNull();
    expect(nextToRead({ ...ready, startedToday: 4 })).toBe('acme/a#3');
    expect(nextToRead({ ...ready, queued: [] })).toBeNull();
  });
});
