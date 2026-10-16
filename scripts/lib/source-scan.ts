export type SourceLanguage = 'ts' | 'css';

export interface ScannedSource {
  /** The source with comments replaced by spaces. Newlines and offsets are kept. */
  code: string;
  /** [start, end) offsets of string-literal contents (quotes excluded). */
  strings: readonly (readonly [number, number])[];
}

/**
 * A small lexer, good enough for policy checks: it blanks out comments and
 * records where string literals are. `'` and `"` strings end at a newline (as
 * in JS), so an apostrophe in JSX text spoils at most one line.
 */
export function scanSource(content: string, lang: SourceLanguage): ScannedSource {
  const out = content.split('');
  const strings: (readonly [number, number])[] = [];
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const n = content.length;
  let i = 0;
  while (i < n) {
    const ch = content.charAt(i);
    const next = content.charAt(i + 1);
    if (ch === '/' && next === '*') {
      const end = content.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (lang === 'ts' && ch === '/' && next === '/') {
      let j = i;
      while (j < n && content.charAt(j) !== '\n') j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || (lang === 'ts' && ch === '`')) {
      let j = i + 1;
      while (j < n) {
        const c = content.charAt(j);
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === ch) break;
        if (c === '\n' && ch !== '`') break;
        j++;
      }
      const end = Math.min(j, n);
      strings.push([i + 1, end]);
      i = end + 1;
      continue;
    }
    i++;
  }
  return { code: out.join(''), strings };
}

export function spanAt(spans: readonly (readonly [number, number])[], index: number): readonly [number, number] | null {
  for (const span of spans) {
    if (index >= span[0] && index < span[1]) return span;
  }
  return null;
}
