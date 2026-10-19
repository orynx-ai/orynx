import { describe, expect, it } from 'vitest';
import { defaultPermissions } from '@devhub/contracts';
import { levelOf, levels, summaryOf } from './permission-levels.ts';

describe('levelOf', () => {
  it('names the level whose seven rows match, and Custom once any row differs', () => {
    for (const level of levels) expect(levelOf(level.permissions)).toBe(level.id);
    const balanced = levels.find((level) => level.id === 'balanced')?.permissions ?? defaultPermissions;
    expect(levelOf({ ...balanced, push: 'never' })).toBe('custom');
  });

  it("calls a fresh Orynx's rows Custom: it asks before commands and never pushes", () => {
    expect(levelOf(defaultPermissions)).toBe('custom');
  });
});

describe('summaryOf', () => {
  it('sorts each row into without asking, asks first and never, in the rows’ order', () => {
    expect(summaryOf(defaultPermissions)).toEqual({
      free: 'Edit files.',
      asks: 'Run commands, use the network, run outside the sandbox, delete outside its copy.',
      never: 'Push the branch, open pull requests.',
    });
  });

  it('splits Allowed only into your allowed commands and the rest, and says Nothing for an empty list', () => {
    const balanced = levels.find((level) => level.id === 'balanced')?.permissions ?? defaultPermissions;
    expect(summaryOf(balanced)).toEqual({
      free: 'Edit files, run your allowed commands.',
      asks: 'Run other commands, use the network, run outside the sandbox, delete outside its copy, push the branch, open pull requests.',
      never: 'Nothing',
    });
    const handsOff = levels.find((level) => level.id === 'handsoff')?.permissions ?? defaultPermissions;
    expect(summaryOf(handsOff).free).toBe(
      'Edit files, run any command, use the network, run outside the sandbox, push the branch, open pull requests.',
    );
  });
});
