import { describe, expect, it } from 'vitest';
import { apiRoutes, StandupSchema } from './index.ts';
import { makeStandup } from './testing.ts';

describe('the standup draft (spec 057, C)', () => {
  it('AC-27, AC-28: holds the day it covers and the draft, at its own path', () => {
    const standup = makeStandup();
    expect(StandupSchema.parse(standup)).toEqual(standup);
    expect(standup.text.startsWith('Yesterday\n')).toBe(true);
    expect(apiRoutes.standup).toBe('/api/standup');
  });

  it('AC-31: names a source it couldn’t read, and only GitHub or Jira', () => {
    expect(StandupSchema.parse({ ...makeStandup(), missing: ['jira'] }).missing).toEqual(['jira']);
    expect(StandupSchema.safeParse({ ...makeStandup(), missing: ['slack'] }).success).toBe(false);
    expect(StandupSchema.safeParse({ ...makeStandup(), day: 'Friday' }).success).toBe(false);
  });
});
