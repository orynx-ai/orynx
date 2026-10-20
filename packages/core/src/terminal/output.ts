import { terminalLimits } from '@devhub/contracts';

/**
 * Command output as the Terminal shows it (spec 036): plain lines, as a person would read them in a terminal.
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

/** A running command's output as it comes, chunk by chunk (spec 036, AC-8). */
export interface OutputBuffer {
  add(chunk: string): void;
  /** The lines so far, the line still being written last. */
  read(): { output: string[]; cut: boolean };
}

/**
 * Keeps the last `most` lines. A line is made plain once it ends, so a code split across chunks is whole by
 * then. One longer than `longest` is broken, so output with no newline (`yes | tr -d '\n'`) can't grow without end.
 */
export function createOutputBuffer(most: number = terminalLimits.lines, longest = 10_000): OutputBuffer {
  const lines: string[] = [];
  let pending = '';
  let cut = false;
  function keep(line: string) {
    lines.push(plainLine(line));
    // Dropped in batches, so a flood of lines costs one splice per `most` lines, not one per line.
    if (lines.length >= 2 * most) {
      lines.splice(0, lines.length - most);
      cut = true;
    }
  }
  return {
    add(chunk) {
      const parts = (pending + chunk).split('\n');
      pending = parts.pop() ?? '';
      for (const part of parts) keep(part);
      for (; pending.length > longest; pending = pending.slice(longest)) keep(pending.slice(0, longest));
    },
    read() {
      const all = pending === '' ? lines : [...lines, plainLine(pending)];
      return { output: all.slice(-most), cut: cut || all.length > most };
    },
  };
}
