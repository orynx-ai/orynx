import type { Finding } from '../gate.ts';

/** Screen files: the route components in packages/app/src/features/**. */
export const SCREEN_FILE = /^packages\/app\/src\/features\/(?:[^/]+\/)*[^/]+-screen\.tsx$/;

const NOTE = /^\/\/ Design: (?:(docs\/design\/screens\/\S+\.html) — \S.*|none — \S.*)$/;
const EXAMPLE = '// Design: docs/design/screens/home.html — needs-your-attention panel';

export function isScreenFile(path: string): boolean {
  return SCREEN_FILE.test(path);
}

export interface DesignNoteResult {
  ok: boolean;
  /** The design file the note points at, when it points at one. */
  reference: string | null;
  finding: Finding | null;
}

/** The first non-empty line of a screen must say which design it was built from, or why there is none. */
export function checkDesignNote(path: string, content: string): DesignNoteResult {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.trim() !== '');
  const first = index === -1 ? '' : (lines[index] ?? '').trim();
  const line = index === -1 ? 1 : index + 1;
  const match = NOTE.exec(first);
  if (match) return { ok: true, reference: match[1] ?? null, finding: null };

  const hasNote = first.startsWith('// Design:');
  const message = hasNote
    ? `the Design note is malformed: "${first}"`
    : 'the screen does not say which design it was built from';
  const fix = hasNote
    ? `write "// Design: docs/design/screens/<file>.html — <part>" or "// Design: none — <reason>" (with an em dash —)`
    : `make the first line "${EXAMPLE}", or "// Design: none — <reason>"`;
  return { ok: false, reference: null, finding: { file: path, line, rule: 'missing-design-note', message, fix } };
}
