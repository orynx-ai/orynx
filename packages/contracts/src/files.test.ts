import { describe, expect, it } from 'vitest';
import { apiPaths, apiRoutes, FileCheckAnswerSchema, FilePathSchema, FilePicksSchema } from './index.ts';

describe('files by path (spec 022)', () => {
  it('AC-10: takes a path from / or ~/ of any length up to 4,096, and nothing that could hide a second line', () => {
    for (const path of ['/Users/dev/notes/plan.pdf', '~/Movies/demo.mov', '/x', `/${'a'.repeat(4095)}`]) {
      expect(FilePathSchema.safeParse(path).success).toBe(true);
    }
    for (const path of ['notes/plan.pdf', '~notes', '', '/two\nlines', '/tab\there', `/${'a'.repeat(4096)}`]) {
      expect(FilePathSchema.safeParse(path).success).toBe(false);
    }
  });

  it('AC-9, AC-11: the picker answers one or more paths, or null for Cancel', () => {
    expect(FilePicksSchema.parse({ paths: ['~/a.png', '/tmp/b.log'] })).toEqual({ paths: ['~/a.png', '/tmp/b.log'] });
    expect(FilePicksSchema.parse({ paths: null })).toEqual({ paths: null });
    expect(FilePicksSchema.safeParse({ paths: [] }).success).toBe(false);
  });

  it('AC-12: a typed path is found, or not', () => {
    expect(FileCheckAnswerSchema.parse({ result: 'found', path: '~/notes.md' })).toEqual({
      result: 'found',
      path: '~/notes.md',
    });
    expect(FileCheckAnswerSchema.parse({ result: 'not_found' })).toEqual({ result: 'not_found' });
    expect(apiRoutes.filePicker).toBe(`/api${apiPaths.filePicker}`);
    expect(apiRoutes.fileCheck).toBe('/api/files/check');
  });
});
