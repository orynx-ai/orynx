/**
 * Markdown as Jira's document format (ADF), for a comment Claude writes from a session (spec 044): headings,
 * paragraphs whose lines break as written, bullet and numbered lists, fenced code, and inside a line bold and code.
 * shortcut: links, italics, quotes, tables and nested lists stay as their text; add them when comments need them.
 */

type Mark = { type: 'strong' } | { type: 'code' };
type AdfInline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
type AdfBlock =
  | { type: 'paragraph'; content: AdfInline[] }
  | { type: 'heading'; attrs: { level: number }; content: AdfInline[] }
  | { type: 'bulletList' | 'orderedList'; content: { type: 'listItem'; content: AdfBlock[] }[] }
  | { type: 'codeBlock'; attrs?: { language: string }; content?: AdfInline[] };

export interface AdfDocument {
  version: 1;
  type: 'doc';
  content: AdfBlock[];
}

const fence = /^```(.*)$/;
const heading = /^(#{1,6}) (.+)$/;
const bullet = /^[-*] (.*)$/;
const numbered = /^\d+\. (.*)$/;

/** A line's text with its `code` and **bold** marked; a mark that never closes stays as it was written. */
function inline(line: string): AdfInline[] {
  const out: AdfInline[] = [];
  let plain = '';
  const flush = () => {
    if (plain !== '') out.push({ type: 'text', text: plain });
    plain = '';
  };
  let at = 0;
  while (at < line.length) {
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
      if (bullet.test(line()) || numbered.test(line())) break;
      block.push(line());
    }
    content.push(paragraph(block));
  }
  return { version: 1, type: 'doc', content };
}
