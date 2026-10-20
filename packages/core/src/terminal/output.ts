/**
 * Claude's command output as the Terminal's Claude tab shows it (spec 036): plain lines, as a person would read them.
 */

/** Colour, cursor and title codes, and short escapes such as a character set: noise in plain text. */
// eslint-disable-next-line no-control-regex -- terminal codes start with the escape character
const escapes = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[ -/]*[0-~]/g;

/** One line with its codes removed; one rewritten with `\r` (a progress bar) shows as its last version. */
function plainLine(line: string): string {
  return line.replace(escapes, '').replace(/\r$/, '').split('\r').at(-1) ?? '';
}

/** Text as plain lines, without the newline at its end. */
export function plainLines(text: string): string[] {
  const lines = text.split('\n').map(plainLine);
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** The last `most` lines of `text`, and whether older ones were dropped to keep them. */
export function lastLines(text: string, most: number): { output: string[]; cut: boolean } {
  const lines = plainLines(text);
  return { output: lines.slice(-most), cut: lines.length > most };
}
