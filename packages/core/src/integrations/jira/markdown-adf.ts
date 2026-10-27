/**
 * Markdown as Jira's document format (ADF), for a comment Claude writes from a session (spec 044): headings,
 * paragraphs whose lines break as written, bullet and numbered lists, and since spec 048 lists nested under an item,
 * quotes, pipe tables with a header row, fenced code, and inside a line bold, italics, code and links.
 * shortcut: a `|` escaped inside a table cell still splits it; read `\|` if a comment needs one.
 */

type Mark = { type: 'strong' } | { type: 'code' } | { type: 'em' } | { type: 'link'; attrs: { href: string } };
type AdfInline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
type AdfBlock =
  | { type: 'paragraph'; content: AdfInline[] }
  | { type: 'heading'; attrs: { level: number }; content: AdfInline[] }
  | { type: 'bulletList' | 'orderedList'; content: { type: 'listItem'; content: AdfBlock[] }[] }
  | { type: 'codeBlock'; attrs?: { language: string }; content?: AdfInline[] }
  | { type: 'blockquote'; content: AdfBlock[] }
  | { type: 'table'; content: { type: 'tableRow'; content: AdfCell[] }[] };
interface AdfCell { type: 'tableHeader' | 'tableCell'; content: AdfBlock[] }

export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfBlock[];
}

const fence = /^```(.*)$/;
const heading = /^(#{1,6}) (.+)$/;
const listItem = /^( *)([-*]|\d+\.) (.*)$/;
const tableRow = /^\|.*\|$/;
const tableRule = /^\|( *:?-{3,}:? *\|)+$/;
const quote = /^> ?(.*)$/;
const linkAt = /^\[([^\]]+)\]\(([^)\s]+)\)/;
// Only links a reader can follow safely: never javascript:, data: or a file on someone's disk.
const safeLink = /^(https?:\/\/|mailto:)/i;
const wordChar = /[\p{L}\p{N}_]/u;

/** `*text*` or `_text_` at `at`: where it closes, or -1. `_` inside a word (snake_case) and a lone `*` aren't italics. */
function italicEnd(line: string, at: number): number {
  const marker = line.charAt(at);
  const end = line.indexOf(marker, at + 1);
  if (end <= at + 1 || line.charAt(at + 1) === ' ' || line.charAt(end - 1) === ' ') return -1;
  if (marker === '_' && (wordChar.test(line.charAt(at - 1)) || wordChar.test(line.charAt(end + 1)))) return -1;
  return end;
}

/** A line's text with its `code`, **bold**, *italics* and [links](…) marked; a mark that never closes stays as written. */
function inline(line: string): AdfInline[] {
  const out: AdfInline[] = [];
  let plain = '';
  const flush = () => {
    if (plain !== '') out.push({ type: 'text', text: plain });
    plain = '';
  };
  let at = 0;
  while (at < line.length) {
    const link = line.charAt(at) === '[' ? linkAt.exec(line.slice(at)) : null;
    if (link !== null && safeLink.test(link[2] ?? '')) {
      flush();
      out.push({ type: 'text', text: link[1] ?? '', marks: [{ type: 'link', attrs: { href: link[2] ?? '' } }] });
      at += link[0].length;
      continue;
    }
    const italic = !line.startsWith('**', at) && '*_'.includes(line.charAt(at)) ? italicEnd(line, at) : -1;
    if (italic !== -1) {
      flush();
      out.push({ type: 'text', text: line.slice(at + 1, italic), marks: [{ type: 'em' }] });
      at = italic + 1;
      continue;
    }
    const marker = line.startsWith('**', at) ? '**' : line.charAt(at) === '`' ? '`' : null;
    const end = marker === null ? -1 : line.indexOf(marker, at + marker.length);
    if (marker !== null && end > at + marker.length) {
      flush();
      const type = marker === '`' ? 'code' : 'strong';
      out.push({ type: 'text', text: line.slice(at + marker.length, end), marks: [{ type }] });
      at = end + marker.length;
      continue;
    }
    plain += line.charAt(at);
    at += 1;
  }
  flush();
  return out;
}

/** Lines of one paragraph, each break kept. */
function paragraph(lines: readonly string[]): AdfBlock {
  return {
    type: 'paragraph',
    content: lines.flatMap((line, index) => [
      ...(index === 0 ? [] : [{ type: 'hardBreak' as const }]),
      ...inline(line),
    ]),
  };
}

/** The list that starts at `start`: its items at that line's indent, each holding the lists indented under it. */
function list(lines: readonly string[], start: number): { block: AdfBlock; end: number } {
  const first = listItem.exec(lines[start] ?? '');
  const indent = first?.[1]?.length ?? 0;
  const ordered = first?.[2] !== '-' && first?.[2] !== '*';
  const items: { type: 'listItem'; content: AdfBlock[] }[] = [];
  let at = start;
  for (let item = first; item !== null; item = listItem.exec(lines[at] ?? '')) {
    const depth = item[1]?.length ?? 0;
    if (depth < indent) break;
    const last = items.at(-1);
    if (depth >= indent + 2 && last !== undefined) {
      const nested = list(lines, at);
      last.content.push(nested.block);
      at = nested.end;
      continue;
    }
    // Another kind of list at this depth is a list of its own.
    if ((item[2] !== '-' && item[2] !== '*') !== ordered) break;
    items.push({ type: 'listItem', content: [paragraph([item[3] ?? ''])] });
    at += 1;
  }
  return { block: { type: ordered ? 'orderedList' : 'bulletList', content: items }, end: at };
}

/** A table starts at `at`: a row of pipes with a `---` line under it. */
function tableStarts(lines: readonly string[], at: number): boolean {
  return tableRow.test((lines[at] ?? '').trim()) && tableRule.test((lines[at + 1] ?? '').trim());
}

/** A table row's cells, the pipes at either end dropped. */
function cells(row: string): string[] {
  return row
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

export function markdownToAdf(markdown: string): AdfDocument {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const content: AdfBlock[] = [];
  let at = 0;
  const line = () => lines[at] ?? '';
  while (at < lines.length) {
    if (line().trim() === '') {
      at += 1;
      continue;
    }
    const fenced = fence.exec(line());
    if (fenced !== null) {
      const code: string[] = [];
      for (at += 1; at < lines.length && line() !== '```'; at += 1) code.push(line());
      at += 1;
      const language = (fenced[1] ?? '').trim();
      const text = code.join('\n');
      content.push({
        type: 'codeBlock',
        ...(language === '' ? {} : { attrs: { language } }),
        ...(text === '' ? {} : { content: [{ type: 'text', text }] }),
      });
      continue;
    }
    const head = heading.exec(line());
    if (head !== null) {
      content.push({ type: 'heading', attrs: { level: (head[1] ?? '#').length }, content: inline(head[2] ?? '') });
      at += 1;
      continue;
    }
    if (quote.test(line())) {
      const quoted: string[] = [];
      for (let inner = quote.exec(line()); inner !== null; inner = quote.exec(line())) {
        quoted.push(inner[1] ?? '');
        at += 1;
      }
      // A quote holds no headings in Jira's format, so one inside it is a paragraph.
      const blocks = markdownToAdf(quoted.join('\n')).content.map((block) =>
        block.type === 'heading' ? { type: 'paragraph' as const, content: block.content } : block,
      );
      content.push({ type: 'blockquote', content: blocks });
      continue;
    }
    if (listItem.test(line())) {
      const found = list(lines, at);
      content.push(found.block);
      at = found.end;
      continue;
    }
    if (tableStarts(lines, at)) {
      const row = (text: string, type: AdfCell['type']) => ({
        type: 'tableRow' as const,
        content: cells(text).map((cell) => ({ type, content: [paragraph([cell])] })),
      });
      const rows = [row(line().trim(), 'tableHeader')];
      for (at += 2; at < lines.length && tableRow.test(line().trim()); at += 1)
        rows.push(row(line().trim(), 'tableCell'));
      content.push({ type: 'table', content: rows });
      continue;
    }
    const block: string[] = [];
    for (; at < lines.length && line().trim() !== '' && !fence.test(line()) && !heading.test(line()); at += 1) {
      if (listItem.test(line()) || quote.test(line()) || tableStarts(lines, at)) break;
      block.push(line());
    }
    content.push(paragraph(block));
  }
  return { version: 1, type: 'doc', content };
}
