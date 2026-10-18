import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  DiffLineSchema,
  FileDiffQuerySchema,
  FileDiffSchema,
  ServerEventSchema,
  SessionChangesSchema,
} from './index.ts';
import { makeChangedFile, makeFileDiff, makeSessionChanges } from './testing.ts';

describe('SessionChangesSchema', () => {
  it('AC-2, AC-4: lists the changed files with their counts, and the totals', () => {
    const changes = makeSessionChanges();
    expect(SessionChangesSchema.parse(changes)).toEqual(changes);
    expect(changes).toMatchObject({ state: 'ready', moreFiles: 0, added: 142, removed: 18 });
    if (changes.state !== 'ready') throw new Error('the builder lists files');
    expect(changes.files.map((file) => file.path)).toEqual([
      'src/content/ContentList.tsx',
      'src/content/api/contentApi.ts',
      'src/content/useSelection.ts',
      'src/content/__tests__/bulkArchive.test.ts',
    ]);
  });

  it('AC-5: marks a binary file and a renamed one, and says how many more files there are past the list', () => {
    const changes = makeSessionChanges({
      files: [
        makeChangedFile({ path: 'public/logo.png', added: 0, removed: 0, binary: true }),
        makeChangedFile({ path: 'src/content/ContentTable.tsx', renamedFrom: 'src/content/List.tsx' }),
      ],
      moreFiles: 41,
    });
    expect(SessionChangesSchema.parse(changes)).toEqual(changes);
  });

  it('AC-6: says why there are no changes to list', () => {
    for (const state of ['no_worktree', 'discarded', 'missing'] as const) {
      expect(SessionChangesSchema.parse({ state })).toEqual({ state });
    }
    expect(SessionChangesSchema.parse(makeSessionChanges({ files: [], added: 0, removed: 0 }))).toMatchObject({
      state: 'ready',
      files: [],
    });
  });

  it('refuses a negative count or an empty path', () => {
    expect(SessionChangesSchema.safeParse({ ...makeSessionChanges(), added: -1 }).success).toBe(false);
    const empty = { ...makeSessionChanges(), files: [{ ...makeChangedFile(), path: '' }] };
    expect(SessionChangesSchema.safeParse(empty).success).toBe(false);
  });
});

describe('FileDiffSchema', () => {
  it('AC-3: holds the lines of one file, with the hunk header between changes far apart', () => {
    const diff = makeFileDiff();
    expect(FileDiffSchema.parse(diff)).toEqual(diff);
    expect(diff.lines.some((line) => line.kind === 'hunk')).toBe(true);
  });

  it('AC-5: says when a diff is binary, renamed, or cut short', () => {
    const binary = makeFileDiff({ path: 'public/logo.png', lines: [], binary: true });
    const renamed = makeFileDiff({ path: 'src/content/ContentTable.tsx', renamedFrom: 'src/content/List.tsx' });
    const cut = makeFileDiff({ cut: true });
    for (const diff of [binary, renamed, cut]) expect(FileDiffSchema.parse(diff)).toEqual(diff);
  });

  it('a line of code has a number, and a hunk header has none', () => {
    expect(DiffLineSchema.parse({ kind: 'added', number: 42, text: 'x' })).toEqual({
      kind: 'added',
      number: 42,
      text: 'x',
    });
    expect(DiffLineSchema.parse({ kind: 'hunk', text: '@@ -40,6 +40,8 @@' })).toEqual({
      kind: 'hunk',
      text: '@@ -40,6 +40,8 @@',
    });
    expect(DiffLineSchema.safeParse({ kind: 'added', text: 'x' }).success).toBe(false);
  });
});

describe('the changes on the wire', () => {
  it('AC-2, AC-3: have their paths under the session', () => {
    expect(apiRoutes.sessionChanges).toBe('/api/sessions/:id/changes');
    expect(apiRoutes.sessionChangesDiff).toBe('/api/sessions/:id/changes/diff');
  });

  it('AC-3, AC-24: the diff takes one path, and refuses none', () => {
    expect(FileDiffQuerySchema.parse({ path: 'src/content/ContentList.tsx' })).toEqual({
      path: 'src/content/ContentList.tsx',
    });
    expect(FileDiffQuerySchema.safeParse({ path: '' }).success).toBe(false);
    expect(FileDiffQuerySchema.safeParse({}).success).toBe(false);
  });

  it("AC-2, AC-23: session.files.changed carries the session's id and nothing else", () => {
    const event = { type: 'session.files.changed', sessionId: '0123456789abcdef' };
    expect(ServerEventSchema.parse(event)).toEqual(event);
    expect(ServerEventSchema.parse({ ...event, path: 'src/a.ts' })).toEqual(event);
    expect(ServerEventSchema.safeParse({ type: 'session.files.changed' }).success).toBe(false);
  });
});
