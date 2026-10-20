/**
 * Command output as the Terminal shows it (spec 036): plain lines, as a person would read them in a terminal.
 */

/** Colour, cursor and title codes, and short escapes such as a character set: noise in plain text. */
// eslint-disable-next-line no-control-regex -- terminal codes start with the escape character
const escapes = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[ -/]*[0-~]/g;

/** Text as lines: codes removed, and a line rewritten with `\r` (a progress bar) shown as its last version. */
export function plainLines(text: string): string[] {
  const lines = text
    .replace(escapes, '')
    .split('\n')
    .map((line) => line.replace(/\r$/, '').split('\r').at(-1) ?? '');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** The last `most` lines of `text`, and whether older ones were dropped to keep them. */
export function lastLines(text: string, most: number): { output: string[]; cut: boolean } {
  const lines = plainLines(text);
  return { output: lines.slice(-most), cut: lines.length > most };
}
