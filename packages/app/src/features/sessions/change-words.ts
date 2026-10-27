import type { Editor } from '@devhub/contracts';

/**
 * The Changes tab's words (spec 013, Q10b, Q10c) and the editor it opens (Q9). The server sends paths and
 * counts; these say them.
 */

const editorNames: Record<Editor, string> = { vscode: 'VS Code', cursor: 'Cursor' };

function lines(count: number, what: 'added' | 'removed'): string {
  return `${String(count)} ${count === 1 ? 'line' : 'lines'} ${what}`;
}

export interface ChangesSummary {
  /** "+142", drawn in success; null for none. */
  added: string | null;
  /** "−18", drawn in danger; null for none. */
  removed: string | null;
  /** The whole line for a screen reader: "142 lines added, 18 lines removed in 4 files". */
  spoken: string;
}

/** "+142 −18" in the tab row (spec 048), read as "142 lines added, 18 lines removed in 4 files". */
export function changesSummary({
  added,
  removed,
  files,
}: {
  added: number;
  removed: number;
  files: number;
}): ChangesSummary {
  const inFiles = `in ${String(files)} ${files === 1 ? 'file' : 'files'}`;
  const counts = [added > 0 ? lines(added, 'added') : null, removed > 0 ? lines(removed, 'removed') : null]
    .filter((part) => part !== null)
    .join(', ');
  return {
    added: added > 0 ? `+${String(added)}` : null,
    removed: removed > 0 ? `−${String(removed)}` : null,
    spoken: counts === '' ? inFiles : `${counts} ${inFiles}`,
  };
}

export type EmptyChanges =
  { state: 'none_yet' } | { state: 'no_worktree' } | { state: 'discarded'; branch: string } | { state: 'missing' };

/** Q10c: why there's nothing to show. */
export function emptyChanges(empty: EmptyChanges): { title: string; line: string } {
  switch (empty.state) {
    case 'none_yet':
      return { title: 'No changes yet', line: 'Files show here as Claude changes them.' };
    case 'no_worktree':
      return { title: 'No changes', line: 'The session stopped before Orynx made a worktree.' };
    case 'discarded':
      return { title: 'The changes are gone', line: `The worktree and ${empty.branch} were deleted.` };
    case 'missing':
      return {
        title: 'The worktree is missing',
        line: 'It was moved or deleted outside Orynx. Discard the session to tidy up.',
      };
  }
}

export const unreadableLine = "Couldn't read the changes.";

/** Q10c: "and 41 more files" past the list. */
export function moreFilesLine(count: number): string {
  return `and ${String(count)} more ${count === 1 ? 'file' : 'files'}`;
}

export const binaryLine = 'Binary file, not shown.';

export function renamedLine(from: string): string {
  return `Renamed from ${from}`;
}

/** Q10c, with the editor Settings picks (Q9). */
export function cutLine(editor: Editor): string {
  return `The rest of this diff is too long to show here. ${openInLabel(editor)} to see it.`;
}

/** Q9, Q10g: "Open in VS Code" or "Open in Cursor". */
export function openInLabel(editor: Editor): string {
  return `Open in ${editorNames[editor]}`;
}

/** The editor's own link for a folder: `vscode://file/<path>` or `cursor://file/<path>`, each part encoded. */
export function editorLink(editor: Editor, path: string): string {
  const encoded = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${editor}://file${encoded}`;
}
