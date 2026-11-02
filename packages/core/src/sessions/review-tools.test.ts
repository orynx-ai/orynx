import { describe, expect, it } from 'vitest';
import type { DiffLine } from '@devhub/contracts';
import { readVerdict, reviewTools, type ReviewToolsContext } from './review-tools.ts';

/** src/a.ts in the pull request's diff: line 41 unchanged, old 42 removed, new 42 and 43 added. */
const lines: DiffLine[] = [
  { kind: 'hunk', text: '@@ -40,3 +40,4 @@' },
  { kind: 'context', number: 41, text: 'export function save() {' },
  { kind: 'removed', number: 42, text: '  return write();' },
  { kind: 'added', number: 42, text: '  const result = write();' },
  { kind: 'added', number: 43, text: '  return result;' },
];

function setUp(full = false) {
  const saved: unknown[] = [];
  const context: ReviewToolsContext = {
    diffLines: (path) => Promise.resolve(path === 'src/a.ts' ? lines : null),
    save: (comment) => {
      if (full) return Promise.resolve('full');
      saved.push(comment);
      return Promise.resolve('saved');
    },
  };
  const [tool] = reviewTools(context);
  if (tool === undefined) throw new Error('no review_comment tool');
  return { tool, saved };
}

describe('review_comment (spec 050)', () => {
  it('AC-8: keeps a comment on an added or unchanged line of the new file, or a removed line of the old', async () => {
    const { tool, saved } = setUp();
    expect(tool.name).toBe('review_comment');
    expect(await tool.asks({})).toBeNull();
    expect(await tool.run({ path: 'src/a.ts', line: 43, text: '  Return the result early.  ' })).toEqual({
      text: 'Orynx kept your comment on src/a.ts:43 for the user to keep, edit or drop. Nothing went to GitHub.',
    });
    await tool.run({ path: 'src/a.ts', line: 41, side: 'new', text: 'Name it saveDraft.' });
    await tool.run({ path: 'src/a.ts', line: 42, side: 'old', text: 'Why drop the direct return?' });
    expect(saved).toEqual([
      { path: 'src/a.ts', line: 43, side: 'new', text: 'Return the result early.' },
      { path: 'src/a.ts', line: 41, side: 'new', text: 'Name it saveDraft.' },
      { path: 'src/a.ts', line: 42, side: 'old', text: 'Why drop the direct return?' },
    ]);
  });

  it("AC-9: refuses a line that isn't in the pull request's diff, as GitHub would", async () => {
    const { tool, saved } = setUp();
    const refusal = (path: string, line: number) => ({
      text: `Line ${String(line)} of ${path} isn't in this pull request's diff. Comment on a line in the diff, or put it in your summary.`,
      error: true,
    });
    expect(await tool.run({ path: 'src/a.ts', line: 88, text: 'Hm.' })).toEqual(refusal('src/a.ts', 88));
    expect(await tool.run({ path: 'src/b.ts', line: 1, text: 'Hm.' })).toEqual(refusal('src/b.ts', 1));
    // Unchanged lines are numbered in the new file, so the old side takes only removed ones.
    expect(await tool.run({ path: 'src/a.ts', line: 41, side: 'old', text: 'Hm.' })).toEqual(refusal('src/a.ts', 41));
    expect(saved).toEqual([]);
  });

  it('AC-10: refuses a 21st comment', async () => {
    const { tool } = setUp(true);
    expect(await tool.run({ path: 'src/a.ts', line: 43, text: 'One more.' })).toEqual({
      text: "That's 20 comments. Put the rest in your summary.",
      error: true,
    });
  });

  it("says what it couldn't read, and saves nothing", async () => {
    const { tool, saved } = setUp();
    for (const input of [{}, { path: 'src/a.ts', line: 0, text: 'x' }, { path: 'src/a.ts', line: 43, text: ' ' }]) {
      expect(await tool.run(input)).toEqual({
        text: "Orynx couldn't read this comment: send path, line, side (new or old) and text.",
        error: true,
      });
    }
    expect(saved).toEqual([]);
  });
});

describe('readVerdict (spec 050)', () => {
  it("AC-14: reads the verdict from the summary's last line and leaves it out of the summary", () => {
    expect(readVerdict('Two bugs in save().\n\nVerdict: request changes')).toEqual({
      summary: 'Two bugs in save().',
      verdict: 'request_changes',
    });
    expect(readVerdict('Reads well.\n**Verdict:** Approve.\n')).toEqual({ summary: 'Reads well.', verdict: 'approve' });
    expect(readVerdict('A question or two.\nverdict: comment')).toEqual({
      summary: 'A question or two.',
      verdict: 'comment',
    });
  });

  it('a summary without a verdict line keeps every word, with no verdict', () => {
    expect(readVerdict('  It looks fine, but I would request changes to the tests.  ')).toEqual({
      summary: 'It looks fine, but I would request changes to the tests.',
      verdict: null,
    });
    expect(readVerdict('Verdict: ship it')).toEqual({ summary: 'Verdict: ship it', verdict: null });
  });
});
