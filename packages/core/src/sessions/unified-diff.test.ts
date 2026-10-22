import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './unified-diff.ts';

/** git's output for one file, as `git diff` prints it: one line per entry. */
const diff = (...lines: string[]) => `${lines.join('\n')}\n`;

describe('parseUnifiedDiff', () => {
  it('AC-3: numbers each line from its hunk, the new file for added and unchanged lines, the old one for removed', () => {
    const parsed = parseUnifiedDiff(
      diff(
        'diff --git a/src/content/ContentList.tsx b/src/content/ContentList.tsx',
        'index 83db48f..bf269f4 100644',
        '--- a/src/content/ContentList.tsx',
        '+++ b/src/content/ContentList.tsx',
        '@@ -40,4 +40,5 @@ import { Table } from "../ui";',
        ' export function ContentList({ items }: Props) {',
        '-  const [rows] = useState(items);',
        '+  const { selected } = useSelection(items);',
        '+  const archive = useBulkArchive();',
        ' ',
        '@@ -52,2 +53,2 @@ export function ContentList({ items }: Props) {',
        '-      <Row key={item.id} item={item} />',
        '+      <Row key={item.id} item={item} checked />',
        ' --- not a header inside a hunk',
      ),
    );
    expect(parsed).toEqual({
      lines: [
        { kind: 'hunk', text: '@@ -40,4 +40,5 @@ import { Table } from "../ui";' },
        { kind: 'context', number: 40, text: 'export function ContentList({ items }: Props) {' },
        { kind: 'removed', number: 41, text: '  const [rows] = useState(items);' },
        { kind: 'added', number: 41, text: '  const { selected } = useSelection(items);' },
        { kind: 'added', number: 42, text: '  const archive = useBulkArchive();' },
        { kind: 'context', number: 43, text: '' },
        { kind: 'hunk', text: '@@ -52,2 +53,2 @@ export function ContentList({ items }: Props) {' },
        { kind: 'removed', number: 52, text: '      <Row key={item.id} item={item} />' },
        { kind: 'added', number: 53, text: '      <Row key={item.id} item={item} checked />' },
        { kind: 'context', number: 54, text: '--- not a header inside a hunk' },
      ],
      binary: false,
      renamedFrom: null,
      cut: false,
    });
  });

  it('AC-4: a new file is all added lines from 1, and a deleted one all removed lines from 1', () => {
    const added = parseUnifiedDiff(
      diff(
        'diff --git a/src/a.ts b/src/a.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/src/a.ts',
        '@@ -0,0 +1,2 @@',
        '+one',
        '+two',
      ),
    );
    expect(added.lines).toEqual([
      { kind: 'hunk', text: '@@ -0,0 +1,2 @@' },
      { kind: 'added', number: 1, text: 'one' },
      { kind: 'added', number: 2, text: 'two' },
    ]);
    const deleted = parseUnifiedDiff(
      diff(
        'diff --git a/b.ts b/b.ts',
        'deleted file mode 100644',
        '--- a/b.ts',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-one',
        '-two',
      ),
    );
    expect(deleted.lines.slice(1)).toEqual([
      { kind: 'removed', number: 1, text: 'one' },
      { kind: 'removed', number: 2, text: 'two' },
    ]);
  });

  it('keeps both halves of a file whose type changed, as when a file becomes a symlink', () => {
    const parsed = parseUnifiedDiff(
      diff(
        'diff --git a/CLAUDE.md b/CLAUDE.md',
        'deleted file mode 100644',
        'index 83db48f..0000000',
        '--- a/CLAUDE.md',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-## Context discipline',
        '-- Load **one** spec',
        'diff --git a/CLAUDE.md b/CLAUDE.md',
        'new file mode 120000',
        'index 0000000..bf269f4',
        '--- /dev/null',
        '+++ b/CLAUDE.md',
        '@@ -0,0 +1 @@',
        '+AGENTS.md',
        '\\ No newline at end of file',
      ),
    );
    expect(parsed.lines).toEqual([
      { kind: 'hunk', text: '@@ -1,2 +0,0 @@' },
      { kind: 'removed', number: 1, text: '## Context discipline' },
      { kind: 'removed', number: 2, text: '- Load **one** spec' },
      { kind: 'hunk', text: '@@ -0,0 +1 @@' },
      { kind: 'added', number: 1, text: 'AGENTS.md' },
    ]);
  });

  it('leaves out "No newline at end of file", which is git speaking, not the file', () => {
    const parsed = parseUnifiedDiff(
      diff('@@ -1 +1 @@', '-old', '\\ No newline at end of file', '+new', '\\ No newline at end of file'),
    );
    expect(parsed.lines).toEqual([
      { kind: 'hunk', text: '@@ -1 +1 @@' },
      { kind: 'removed', number: 1, text: 'old' },
      { kind: 'added', number: 1, text: 'new' },
    ]);
  });

  it('AC-5: says where a renamed file came from, with its changes or without any', () => {
    const changed = parseUnifiedDiff(
      diff(
        'diff --git a/src/content/List.tsx b/src/content/ContentTable.tsx',
        'similarity index 90%',
        'rename from src/content/List.tsx',
        'rename to src/content/ContentTable.tsx',
        'index 1111111..2222222 100644',
        '--- a/src/content/List.tsx',
        '+++ b/src/content/ContentTable.tsx',
        '@@ -1 +1 @@',
        '-export const List = 1;',
        '+export const ContentTable = 1;',
      ),
    );
    expect(changed).toMatchObject({ renamedFrom: 'src/content/List.tsx', binary: false });
    expect(changed.lines).toHaveLength(3);
    const moved = parseUnifiedDiff(
      diff('diff --git a/a.ts b/b.ts', 'similarity index 100%', 'rename from a.ts', 'rename to b.ts'),
    );
    expect(moved).toEqual({ lines: [], binary: false, renamedFrom: 'a.ts', cut: false });
  });

  it('reads a path git quoted, such as one with an accent or a quote in it', () => {
    const parsed = parseUnifiedDiff(
      diff(
        'diff --git "a/src/sp\\303\\251cial.ts" b/src/plain.ts',
        'rename from "src/sp\\303\\251cial \\"one\\".ts"',
        'rename to src/plain.ts',
      ),
    );
    expect(parsed.renamedFrom).toBe('src/spécial "one".ts');
  });

  it('AC-5: says a binary file has no lines to show', () => {
    const parsed = parseUnifiedDiff(
      diff(
        'diff --git a/public/logo.png b/public/logo.png',
        'index 1111111..2222222 100644',
        'Binary files a/public/logo.png and b/public/logo.png differ',
      ),
    );
    expect(parsed).toEqual({ lines: [], binary: true, renamedFrom: null, cut: false });
  });

  it('AC-5, Q5: stops after 2,000 lines and says it was cut short', () => {
    const many = Array.from({ length: 2_500 }, (_, n) => `+line ${String(n + 1)}`);
    const parsed = parseUnifiedDiff(diff('--- /dev/null', '+++ b/big.txt', '@@ -0,0 +1,2500 @@', ...many));
    expect(parsed.lines).toHaveLength(2_000);
    expect(parsed.lines.at(-1)).toEqual({ kind: 'added', number: 1_999, text: 'line 1999' });
    expect(parsed.cut).toBe(true);
    const exactly = parseUnifiedDiff(diff('@@ -0,0 +1,1999 @@', ...many.slice(0, 1_999)));
    expect(exactly).toMatchObject({ cut: false });
    expect(exactly.lines).toHaveLength(2_000);
    const withNote = parseUnifiedDiff(
      diff('@@ -0,0 +1,1999 @@', ...many.slice(0, 1_999), '\\ No newline at end of file'),
    );
    expect(withNote).toMatchObject({ cut: false });
  });

  it('reads nothing as no lines, as git prints for a file whose mode alone changed', () => {
    expect(parseUnifiedDiff('')).toEqual({ lines: [], binary: false, renamedFrom: null, cut: false });
    expect(parseUnifiedDiff(diff('diff --git a/run.sh b/run.sh', 'old mode 100644', 'new mode 100755'))).toEqual({
      lines: [],
      binary: false,
      renamedFrom: null,
      cut: false,
    });
  });

  it('keeps a carriage return out of the line, so a Windows file reads like any other', () => {
    expect(parseUnifiedDiff('@@ -1 +1 @@\r\n-old\r\n+new\r\n').lines.slice(1)).toEqual([
      { kind: 'removed', number: 1, text: 'old' },
      { kind: 'added', number: 1, text: 'new' },
    ]);
  });
});
