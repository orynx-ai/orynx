import { describe, expect, it } from 'vitest';
import {
  binaryLine,
  changesSummary,
  cutLine,
  editorLink,
  emptyChanges,
  moreFilesLine,
  openInLabel,
  renamedLine,
} from './change-words.ts';

describe('the Changes tab’s words (spec 013, Q10)', () => {
  it('AC-2, AC-18 (spec 048): sums up the changes as "+142 −18", read as words with the files', () => {
    expect(changesSummary({ added: 142, removed: 18, files: 4 })).toEqual({
      added: '+142',
      removed: '−18',
      spoken: '142 lines added, 18 lines removed in 4 files',
    });
    expect(changesSummary({ added: 21, removed: 0, files: 1 })).toEqual({
      added: '+21',
      removed: null,
      spoken: '21 lines added in 1 file',
    });
    expect(changesSummary({ added: 0, removed: 3, files: 1 })).toMatchObject({
      added: null,
      removed: '−3',
      spoken: '3 lines removed in 1 file',
    });
    expect(changesSummary({ added: 0, removed: 0, files: 1 })).toMatchObject({ spoken: 'in 1 file' });
  });

  it('AC-6, Q10c: says why there are no changes to show', () => {
    expect(emptyChanges({ state: 'none_yet' })).toEqual({
      title: 'No changes yet',
      line: 'Files show here as Claude changes them.',
    });
    expect(emptyChanges({ state: 'no_worktree' })).toEqual({
      title: 'No changes',
      line: 'The session stopped before Orynx made a worktree.',
    });
    expect(emptyChanges({ state: 'discarded', branch: 'feat/PROJ-1423' })).toEqual({
      title: 'The changes are gone',
      line: 'The worktree and feat/PROJ-1423 were deleted.',
    });
    expect(emptyChanges({ state: 'missing' })).toEqual({
      title: 'The worktree is missing',
      line: 'It was moved or deleted outside Orynx. Discard the session to tidy up.',
    });
  });

  it('AC-5, Q10c: says how many more files there are, and why a diff shows less', () => {
    expect(moreFilesLine(41)).toBe('and 41 more files');
    expect(moreFilesLine(1)).toBe('and 1 more file');
    expect(binaryLine).toBe('Binary file, not shown.');
    expect(renamedLine('src/content/List.tsx')).toBe('Renamed from src/content/List.tsx');
    expect(cutLine('vscode')).toBe('The rest of this diff is too long to show here. Open in VS Code to see it.');
    expect(cutLine('cursor')).toBe('The rest of this diff is too long to show here. Open in Cursor to see it.');
  });

  it('AC-20, AC-26, Q9: opens the worktree in the editor Settings picks', () => {
    expect(openInLabel('vscode')).toBe('Open in VS Code');
    expect(openInLabel('cursor')).toBe('Open in Cursor');
    expect(editorLink('vscode', '/Users/you/.devhub/worktrees/0123456789abcdef')).toBe(
      'vscode://file/Users/you/.devhub/worktrees/0123456789abcdef',
    );
    expect(editorLink('cursor', '/Users/you/.devhub/worktrees/0123456789abcdef')).toBe(
      'cursor://file/Users/you/.devhub/worktrees/0123456789abcdef',
    );
    expect(editorLink('vscode', '/Users/you/My Code/wt')).toBe('vscode://file/Users/you/My%20Code/wt');
  });
});
