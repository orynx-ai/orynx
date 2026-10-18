/**
 * Reads the Markdown Orynx's Jira converter writes (spec 013, Q8) into blocks the `Markdown` component lays
 * out: headings, paragraphs, lists (nested, numbered, task items), fenced code, quotes, rules and tables, and
 * inside a line code, bold, italic, strike and links. It reads nothing else: HTML and anything it doesn't know
 * stay plain text, so a description can never run code in the page (AC-10). Pure, and tested as a table.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: 'code'; text: string }
  | { kind: 'strong' | 'em' | 'strike'; inline: Inline[] }
  | { kind: 'link'; href: string; inline: Inline[] };

export interface ListItem {
  /** A task item's state: true when done; null for an ordinary item. */
  checked: boolean | null;
  inline: Inline[];
  /** What the item holds below its first line, such as a nested list. */
  blocks: Block[];
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Block =
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'heading'; level: HeadingLevel; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'code'; language: string; text: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' }
  | { kind: 'table'; header: Inline[][] | null; rows: Inline[][][] };

const fence = /^```(.*)$/;
const heading = /^(#{1,6}) (.*)$/;
const listItem = /^( *)([-*]|(\d+)\.) (.*)$/;
const task = /^\[([ xX])\] (.*)$/;
const tableRow = /^\|.*\|$/;
const separator = /^\|(\s*:?-{3,}:?\s*\|)+$/;

/** An `http` or `https` link as it was written; null for anything else, which shows as its text (AC-10). */
export function safeLink(href: string): string | null {
  try {
    const { protocol } = new URL(href);
    return protocol === 'http:' || protocol === 'https:' ? href : null;
  } catch {
    return null;
  }
}

/** Where `marker` closes, from `from`: an occurrence not followed by its own character, so `***x***` nests. */
function closing(text: string, marker: string, from: number): number {
  for (let at = text.indexOf(marker, from); at !== -1; at = text.indexOf(marker, at + 1)) {
    if (text.charAt(at + marker.length) !== marker.charAt(0)) return at;
  }
  return -1;
}

function inlineOf(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain !== '') out.push({ kind: 'text', text: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '\n') {
      flush();
      out.push({ kind: 'break' });
      i += 1;
      continue;
    }
    if (char === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const marked = (
      [
        ['**', 'strong'],
        ['~~', 'strike'],
        ['*', 'em'],
      ] as const
    ).find(([marker]) => text.startsWith(marker, i));
    if (marked !== undefined) {
      const [marker, kind] = marked;
      const end = closing(text, marker, i + marker.length);
      if (end > i + marker.length) {
        flush();
        out.push({ kind, inline: inlineOf(text.slice(i + marker.length, end)) });
        i = end + marker.length;
        continue;
      }
    }
    if (char === '[') {
      const middle = text.indexOf('](', i + 1);
      const end = middle === -1 ? -1 : text.indexOf(')', middle + 2);
      if (end !== -1) {
        flush();
        out.push({ kind: 'link', href: text.slice(middle + 2, end), inline: inlineOf(text.slice(i + 1, middle)) });
        i = end + 1;
        continue;
      }
    }
    plain += char;
    i += 1;
  }
  flush();
  return out;
}

/** A table row's cells; the converter writes a pipe inside a cell as `\|`. */
function cellsOf(row: string): Inline[][] {
  const cells: string[] = [];
  let cell = '';
  const inner = row.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    const char = inner.charAt(i);
    if (char === '\\' && inner.charAt(i + 1) === '|') {
      cell += '|';
      i += 1;
    } else if (char === '|') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((text) => inlineOf(text.trim()));
}

function startsBlock(line: string): boolean {
  const item = listItem.exec(line);
  return (
    fence.test(line) ||
    heading.test(line) ||
    line === '---' ||
    line.startsWith('>') ||
    tableRow.test(line) ||
    (item !== null && item[1] === '')
  );
}

function blocksOf(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  const at = (n: number) => lines[n] ?? '';
  while (i < lines.length) {
    const line = at(i);
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const fenced = fence.exec(line);
    if (fenced !== null) {
      const body: string[] = [];
      for (i += 1; i < lines.length && at(i) !== '```'; i++) body.push(at(i));
      i += 1;
      blocks.push({ kind: 'code', language: (fenced[1] ?? '').trim(), text: body.join('\n') });
      continue;
    }

    const head = heading.exec(line);
    if (head !== null) {
      const level = (head[1] ?? '#').length as HeadingLevel;
      blocks.push({ kind: 'heading', level, inline: inlineOf(head[2] ?? '') });
      i += 1;
      continue;
    }

    if (line === '---') {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const quoted: string[] = [];
      for (; i < lines.length && at(i).startsWith('>'); i++) quoted.push(at(i).replace(/^> ?/, ''));
      blocks.push({ kind: 'quote', blocks: blocksOf(quoted) });
      continue;
    }

    if (tableRow.test(line)) {
      const rows: string[] = [];
      for (; i < lines.length && tableRow.test(at(i)); i++) rows.push(at(i));
      const headed = rows.length > 1 && separator.test(rows[1] ?? '');
      blocks.push({
        kind: 'table',
        header: headed ? cellsOf(rows[0] ?? '') : null,
        rows: (headed ? rows.slice(2) : rows).map(cellsOf),
      });
      continue;
    }

    const first = listItem.exec(line);
    if (first !== null && first[1] === '') {
      const ordered = first[3] !== undefined;
      const items: ListItem[] = [];
      for (;;) {
        const item = listItem.exec(at(i));
        if (i >= lines.length || item?.[1] !== '' || (item[3] !== undefined) !== ordered) break;
        // The lines under an item line up with its text, after the marker.
        const indent = ' '.repeat((item[2] ?? '-').length + 1);
        const done = ordered ? null : task.exec(item[4] ?? '');
        const below: string[] = [];
        for (i += 1; i < lines.length && at(i).startsWith(indent); i++) below.push(at(i).slice(indent.length));
        items.push({
          checked: done === null ? null : done[1] !== ' ',
          inline: inlineOf(done === null ? (item[4] ?? '') : (done[2] ?? '')),
          blocks: blocksOf(below),
        });
      }
      blocks.push({ kind: 'list', ordered, start: ordered ? Number(first[3]) : 1, items });
      continue;
    }

    const paragraph: string[] = [line];
    for (i += 1; i < lines.length && at(i).trim() !== '' && !startsBlock(at(i)); i++) paragraph.push(at(i));
    blocks.push({ kind: 'paragraph', inline: inlineOf(paragraph.join('\n')) });
  }
  return blocks;
}

export function parseMarkdown(text: string): Block[] {
  return blocksOf(text.replace(/\r\n?/g, '\n').split('\n'));
}
