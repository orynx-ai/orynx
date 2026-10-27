/**
 * Markdown as Jira's document format (ADF), for a comment Claude writes from a session (spec 044): headings,
 * paragraphs whose lines break as written, bullet and numbered lists, quotes, fenced code, and inside a line bold,
 * italics, code and links (spec 048).
 * shortcut: tables and nested lists stay as their text; add them when comments need them.
 */

type Mark = { type: 'strong' } | { type: 'code' } | { type: 'em' } | { type: 'link'; attrs: { href: string } };
type AdfInline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
type AdfBlock =
  | { type: 'paragraph'; content: AdfInline[] }
  | { type: 'heading'; attrs: { level: number }; content: AdfInline[] }
  | { type: 'bulletList' | 'orderedList'; content: { type: 'listItem'; content: AdfBlock[] }[] }
  | { type: 'codeBlock'; attrs?: { language: string }; content?: AdfInline[] }
  | { type: 'blockquote'; content: AdfBlock[] };

export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfBlock[];
}

const fence = /^```(.*)$/;
const heading = /^(#{1,6}) (.+)$/;
const bullet = /^[-*] (.*)$/;
const numbered = /^\d+\. (.*)$/;
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
    const list = bullet.test(line()) ? bullet : numbered.test(line()) ? numbered : null;
    if (list !== null) {
      const items: { type: 'listItem'; content: AdfBlock[] }[] = [];
      for (let item = list.exec(line()); item !== null; item = list.exec(line())) {
        items.push({ type: 'listItem', content: [paragraph([item[1] ?? ''])] });
        at += 1;
      }
      content.push({ type: list === bullet ? 'bulletList' : 'orderedList', content: items });
      continue;
    }
    const block: string[] = [];
    for (; at < lines.length && line().trim() !== '' && !fence.test(line()) && !heading.test(line()); at += 1) {
      if (bullet.test(line()) || numbered.test(line()) || quote.test(line())) break;
      block.push(line());
    }
    content.push(paragraph(block));
  }
  return { version: 1, type: 'doc', content };
}
