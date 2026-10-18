import { readFile, stat } from 'node:fs/promises';
import type { ChangeLine } from '@devhub/contracts';

/**
 * The change an edit would make, for the approval callout while Ask before everything is on (spec 012,
 * Q9): the lines it takes out and the lines it puts in, numbered from where they sit in the file. Only
 * the first lines are shown; the rest are counted. The file is Claude's, so it's read with a limit, and
 * a file that can't be read is previewed from the call alone.
 */

export const previewLineLimit = 20;
export const previewReadLimit = 1024 * 1024;

export interface EditPreview {
  /** The file doesn't exist yet. */
  creates: boolean;
  lines: ChangeLine[];
  /** Lines of the change beyond the ones shown. */
  moreLines: number;
}

export type EditTool = 'Edit' | 'Write' | 'NotebookEdit';

const nothing: EditPreview = { creates: false, lines: [], moreLines: 0 };

/** The file's text, or null when it's missing, too big, or can't be read; `exists` tells the first apart. */
async function currentText(path: string): Promise<{ text: string | null; exists: boolean }> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > previewReadLimit) return { text: null, exists: true };
    return { text: await readFile(path, 'utf8'), exists: true };
  } catch (error) {
    return { text: null, exists: (error as NodeJS.ErrnoException).code !== 'ENOENT' };
  }
}

/** Lines of a text, without the empty one a trailing newline would add. */
function linesOf(text: string): string[] {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function changeLines(removed: readonly string[], removedFrom: number, added: readonly string[], addedFrom: number) {
  return [
    ...removed.map((text, i): ChangeLine => ({ kind: 'removed', number: removedFrom + i, text })),
    ...added.map((text, i): ChangeLine => ({ kind: 'added', number: addedFrom + i, text })),
  ];
}

function shown(creates: boolean, lines: ChangeLine[]): EditPreview {
  return {
    creates,
    lines: lines.slice(0, previewLineLimit),
    moreLines: Math.max(0, lines.length - previewLineLimit),
  };
}

/** What differs between two texts, with the lines they share at the start and the end left out. */
function differing(old: readonly string[], next: readonly string[]) {
  let start = 0;
  while (start < old.length && start < next.length && old[start] === next[start]) start += 1;
  let oldEnd = old.length;
  let nextEnd = next.length;
  while (oldEnd > start && nextEnd > start && old[oldEnd - 1] === next[nextEnd - 1]) {
    oldEnd -= 1;
    nextEnd -= 1;
  }
  return changeLines(old.slice(start, oldEnd), start + 1, next.slice(start, nextEnd), start + 1);
}

/** The whole lines an Edit touches, and those lines with the replacement made. */
function editedLines(text: string, at: number, old: string, next: string) {
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  let end = at + old.length;
  // Old text that ends with a newline ends at that line, not the next.
  if (old.endsWith('\n')) end -= 1;
  const newlineAfter = text.indexOf('\n', end);
  const lineEnd = newlineAfter === -1 ? text.length : newlineAfter;
  const before = text.slice(lineStart, at);
  const after = text.slice(Math.min(at + old.length, lineEnd), lineEnd);
  const removed = text.slice(lineStart, lineEnd).split('\n');
  const replaced = before + next + after;
  const added = replaced === '' ? [] : linesOf(replaced);
  const from = (text.slice(0, lineStart).match(/\n/g)?.length ?? 0) + 1;
  return changeLines(removed, from, added, from);
}

export async function previewEdit(
  tool: EditTool,
  input: Readonly<Record<string, unknown>>,
  path: string,
): Promise<EditPreview> {
  switch (tool) {
    case 'Write': {
      const content = input['content'];
      if (typeof content !== 'string') return nothing;
      const { text, exists } = await currentText(path);
      const added = linesOf(content);
      if (text === null) return shown(!exists, changeLines([], 1, added, 1));
      return shown(false, differing(linesOf(text), added));
    }
    case 'Edit': {
      const old = input['old_string'];
      const next = input['new_string'];
      if (typeof old !== 'string' || typeof next !== 'string') return nothing;
      const { text } = await currentText(path);
      const at = text === null || old === '' ? -1 : text.indexOf(old);
      if (text === null || at === -1) return shown(false, changeLines(linesOf(old), 1, linesOf(next), 1));
      return shown(false, editedLines(text, at, old, next));
    }
    case 'NotebookEdit': {
      const source = input['new_source'];
      if (typeof source !== 'string') return nothing;
      return shown(false, changeLines([], 1, linesOf(source), 1));
    }
  }
}
