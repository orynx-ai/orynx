import { describe, expect, it } from 'vitest';
import { matchesWords } from './match-words.ts';

describe('matching what was typed', () => {
  it('needs every word typed, in any order and any case, anywhere in the text (spec 007 Q10a)', () => {
    const text = 'PROJ-1423 Add bulk archive In Progress';

    expect(matchesWords(text, 'archive')).toBe(true);
    expect(matchesWords(text, '  ARCHIVE   proj-1423 ')).toBe(true);
    expect(matchesWords(text, 'archive done')).toBe(false);
  });

  it('isn’t fuzzy: a typo finds nothing', () => {
    expect(matchesWords('Add bulk archive', 'archve')).toBe(false);
  });

  it('matches everything when nothing is typed', () => {
    expect(matchesWords('Add bulk archive', '   ')).toBe(true);
  });
});
