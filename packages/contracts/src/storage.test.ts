import { describe, expect, it } from 'vitest';
import { apiRoutes, StorageSchema } from './index.ts';

describe('storage (spec 047, D)', () => {
  it("AC-16, AC-17: the worktrees' size, and what each choice of days would delete now", () => {
    const storage = {
      bytes: 9_000_000_000,
      choices: [
        { days: 7, sessions: 5, bytes: 6_000_000_000 },
        { days: 14, sessions: 4, bytes: 5_000_000_000 },
        { days: 30, sessions: 3, bytes: 4_100_000_000 },
        { days: 90, sessions: 0, bytes: 0 },
      ],
    };
    expect(StorageSchema.parse(storage)).toEqual(storage);
    expect(apiRoutes.storage).toBe('/api/storage');
  });

  it('refuses a choice Settings never offers, and a negative size', () => {
    expect(StorageSchema.safeParse({ bytes: 0, choices: [{ days: 10, sessions: 0, bytes: 0 }] }).success).toBe(false);
    expect(StorageSchema.safeParse({ bytes: -1, choices: [] }).success).toBe(false);
  });
});
