import { describe, expect, it } from 'vitest';
import { adfToMarkdown } from './adf-markdown.ts';

const doc = (...content: unknown[]) => ({ type: 'doc', version: 1, content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const item = (...content: unknown[]) => ({ type: 'listItem', content });

describe('adfToMarkdown', () => {
  it('AC-3: has nothing to say for no description', () => {
    expect(adfToMarkdown(null)).toBeNull();
    expect(adfToMarkdown(undefined)).toBeNull();
    expect(adfToMarkdown(doc())).toBeNull();
    expect(adfToMarkdown(doc(p()))).toBeNull();
  });

  it('AC-3: keeps paragraphs apart with a blank line', () => {
    expect(adfToMarkdown(doc(p(text('First.')), p(text('Second.'))))).toBe('First.\n\nSecond.');
  });

  it('AC-3: writes headings by their level', () => {
    expect(adfToMarkdown(doc({ type: 'heading', attrs: { level: 3 }, content: [text('Acceptance criteria')] }))).toBe(
      '### Acceptance criteria',
    );
  });

  it('AC-3: writes bold, italic, struck, code and linked text', () => {
    const line = p(
      text('Archive', [{ type: 'strong' }]),
      text(' many ', [{ type: 'em' }]),
      text('old', [{ type: 'strike' }]),
      text(' items with '),
      text('bulkArchive()', [{ type: 'code' }]),
      text(', see '),
      text('the doc', [{ type: 'link', attrs: { href: 'https://example.com/doc' } }]),
      text('.'),
    );
    // Spaces stay outside the marks, so " many " in italics is " *many* ".
    expect(adfToMarkdown(doc(line))).toBe(
      '**Archive** *many* ~~old~~ items with `bulkArchive()`, see [the doc](https://example.com/doc).',
    );
  });

  it('AC-3: writes bullet, numbered and nested lists', () => {
    const description = doc(
      {
        type: 'bulletList',
        content: [
          item(p(text('Checkbox on each row'))),
          item(p(text('Archive selected')), {
            type: 'orderedList',
            attrs: { order: 1 },
            content: [item(p(text('In the toolbar'))), item(p(text('Disabled at 0')))],
          }),
        ],
      },
      { type: 'orderedList', attrs: { order: 3 }, content: [item(p(text('Third')))] },
    );
    expect(adfToMarkdown(description)).toBe(
      [
        '- Checkbox on each row',
        '- Archive selected',
        '  1. In the toolbar',
        '  2. Disabled at 0',
        '',
        '3. Third',
      ].join('\n'),
    );
  });

  it('AC-3: keeps a code block as it is, with its language', () => {
    const block = { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;\nconst b = 2;')] };
    expect(adfToMarkdown(doc(block))).toBe('```ts\nconst a = 1;\nconst b = 2;\n```');
  });

  it('AC-3: quotes a blockquote and a panel, line by line', () => {
    expect(adfToMarkdown(doc({ type: 'blockquote', content: [p(text('One')), p(text('Two'))] }))).toBe(
      '> One\n>\n> Two',
    );
    expect(adfToMarkdown(doc({ type: 'panel', attrs: { panelType: 'info' }, content: [p(text('Heads up'))] }))).toBe(
      '> Heads up',
    );
  });

  it('AC-3: writes mentions, emoji, cards, dates, statuses, breaks and rules as text', () => {
    const line = p(
      { type: 'mention', attrs: { id: 'abc', text: '@Neha K.' } },
      text(' asked '),
      { type: 'emoji', attrs: { shortName: ':wave:', text: '👋' } },
      { type: 'hardBreak' },
      { type: 'inlineCard', attrs: { url: 'https://your-team.atlassian.net/browse/PROJ-1' } },
      text(' by '),
      { type: 'date', attrs: { timestamp: '1792022400000' } },
      text(' '),
      { type: 'status', attrs: { text: 'BLOCKED', color: 'red' } },
    );
    expect(adfToMarkdown(doc(line, { type: 'rule' }, p(text('After'))))).toBe(
      '@Neha K. asked 👋\nhttps://your-team.atlassian.net/browse/PROJ-1 by 2026-10-15 BLOCKED\n\n---\n\nAfter',
    );
  });

  it('AC-3: writes a task list with its ticks', () => {
    const tasks = {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { state: 'DONE' }, content: [text('Design')] },
        { type: 'taskItem', attrs: { state: 'TODO' }, content: [text('Build')] },
      ],
    };
    expect(adfToMarkdown(doc(tasks))).toBe('- [x] Design\n- [ ] Build');
  });

  it('AC-3: writes a table as rows of cells', () => {
    const cell = (type: string, value: string) => ({ type, content: [p(text(value))] });
    const table = {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Case'), cell('tableHeader', 'Result')] },
        { type: 'tableRow', content: [cell('tableCell', '207'), cell('tableCell', 'Partial | failure')] },
      ],
    };
    expect(adfToMarkdown(doc(table))).toBe('| Case | Result |\n| --- | --- |\n| 207 | Partial \\| failure |');
  });

  it('AC-3: keeps the text of anything else, and drops what has none', () => {
    const unknown = { type: 'somethingNew', content: [p(text('Inside'))] };
    const media = { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x', type: 'file' } }] };
    expect(adfToMarkdown(doc(unknown, media, p(text('End'))))).toBe('Inside\n\nEnd');
  });

  it('AC-13: never throws on a description it can’t read', () => {
    for (const odd of [42, 'plain text', [], { type: 'doc', content: 'nope' }, { content: [{ type: 'text' }] }]) {
      expect(() => adfToMarkdown(odd)).not.toThrow();
    }
    expect(adfToMarkdown('plain text')).toBe('plain text');
  });
});
