import type { DiffLine } from '@devhub/contracts';

/**
 * Turns git's unified diff of one file into the lines the Changes tab shows (spec 013, Q5). Pure, because
 * git's output is the only input: the header says whether the file is binary or renamed, each `@@` line
 * starts a hunk, and the lines after it are numbered from it, the new file for added and unchanged lines and
 * the old one for removed lines, as `DiffView` shows them. It stops after `most` lines and says so.
 */

export interface ParsedDiff {
  lines: DiffLine[];
  binary: boolean;
  /** The path git says a renamed file had before. */
  renamedFrom: string | null;
  /** There were more than `most` lines, and only those are here. */
  cut: boolean;
}

/** A diff shows at most this many lines (Q5). */
export const mostDiffLines = 2_000;

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const escapes: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/** A path as git prints it: as it is, or in double quotes with C escapes and octal bytes for anything unusual. */
export function unquotePath(path: string): string {
  if (!(path.length >= 2 && path.startsWith('"') && path.endsWith('"'))) return path;
  const bytes: number[] = [];
  const inner = path.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    const char = inner.charAt(i);
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'));
      continue;
    }
    const octal = /^[0-7]{3}/.exec(inner.slice(i + 1));
    if (octal !== null) {
      bytes.push(Number.parseInt(octal[0], 8));
      i += 3;
      continue;
    }
    const next = inner.charAt(i + 1);
    bytes.push(escapes[next] ?? next.charCodeAt(0));
    i += 1;
  }
  return Buffer.from(bytes).toString('utf8');
}

export function parseUnifiedDiff(text: string, most: number = mostDiffLines): ParsedDiff {
  const parsed: ParsedDiff = { lines: [], binary: false, renamedFrom: null, cut: false };
  const rows = text.split('\n');
  if (rows.at(-1) === '') rows.pop();

  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  /** Whether another line fits; once one doesn't, the diff was cut short. */
  const fits = () => {
    parsed.cut = parsed.lines.length >= most;
    return !parsed.cut;
  };
  for (const raw of rows) {
    const row = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const hunk = hunkHeader.exec(row);
    if (hunk !== null) {
      if (!fits()) break;
      parsed.lines.push({ kind: 'hunk', text: row });
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (row.startsWith('rename from ')) parsed.renamedFrom = unquotePath(row.slice('rename from '.length));
      else if (row.startsWith('Binary files ') && row.endsWith(' differ')) parsed.binary = true;
      continue;
    }
    // One file at a time: another file's header ends this one.
    if (row.startsWith('diff --git ')) break;
    // "\ No newline at end of file" is git's own note, not a line of the file.
    if (row.startsWith('\\')) continue;
    if (!fits()) break;
    const code = row.slice(1);
    if (row.startsWith('+')) {
      parsed.lines.push({ kind: 'added', number: newLine, text: code });
      newLine += 1;
    } else if (row.startsWith('-')) {
      parsed.lines.push({ kind: 'removed', number: oldLine, text: code });
      oldLine += 1;
    } else {
      parsed.lines.push({ kind: 'context', number: newLine, text: code });
      oldLine += 1;
      newLine += 1;
    }
  }
  return parsed;
}
