import { describe, expect, it } from 'vitest';
import { parseMarkdown, safeLink } from './markdown-blocks.ts';

// The Markdown Orynx's Jira converter writes (packages/core/src/integrations/jira/adf-markdown.ts), as its own
// tests show it. This parser reads that and nothing more (spec 013, Q8).

describe('parseMarkdown', () => {
  it('AC-9: reads paragraphs and headings, a line break kept inside a paragraph', () => {
    expect(parseMarkdown('Content managers need it.\nOne by one is slow.\n\n### Acceptance criteria')).toEqual([
      {
        kind: 'paragraph',
        inline: [
          { kind: 'text', text: 'Content managers need it.' },
          { kind: 'break' },
          { kind: 'text', text: 'One by one is slow.' },
        ],
      },
      { kind: 'heading', level: 3, inline: [{ kind: 'text', text: 'Acceptance criteria' }] },
    ]);
  });

  it('AC-9: reads bullet, numbered and nested lists, and task items done or not', () => {
    const text = [
      '- Checkbox on each row',
      '  - plus select all',
      '- Archive selected',
      '',
      '3. Third',
      '4. Fourth',
    ].join('\n');
    expect(parseMarkdown(text)).toEqual([
      {
        kind: 'list',
        ordered: false,
        start: 1,
        items: [
          {
            checked: null,
            inline: [{ kind: 'text', text: 'Checkbox on each row' }],
            blocks: [
              {
                kind: 'list',
                ordered: false,
                start: 1,
                items: [{ checked: null, inline: [{ kind: 'text', text: 'plus select all' }], blocks: [] }],
              },
            ],
          },
          { checked: null, inline: [{ kind: 'text', text: 'Archive selected' }], blocks: [] },
        ],
      },
      {
        kind: 'list',
        ordered: true,
        start: 3,
        items: [
          { checked: null, inline: [{ kind: 'text', text: 'Third' }], blocks: [] },
          { checked: null, inline: [{ kind: 'text', text: 'Fourth' }], blocks: [] },
        ],
      },
    ]);
    expect(parseMarkdown('- [x] Done\n- [ ] To do')).toEqual([
      {
        kind: 'list',
        ordered: false,
        start: 1,
        items: [
          { checked: true, inline: [{ kind: 'text', text: 'Done' }], blocks: [] },
          { checked: false, inline: [{ kind: 'text', text: 'To do' }], blocks: [] },
        ],
      },
    ]);
  });

  it('AC-9: reads code, bold, italic, strike and links inside a line', () => {
    expect(
      parseMarkdown('Call `bulkArchive()` **now**, *carefully*, ~~never~~ [see the docs](https://docs.example.com/a)'),
    ).toEqual([
      {
        kind: 'paragraph',
        inline: [
          { kind: 'text', text: 'Call ' },
          { kind: 'code', text: 'bulkArchive()' },
          { kind: 'text', text: ' ' },
          { kind: 'strong', inline: [{ kind: 'text', text: 'now' }] },
          { kind: 'text', text: ', ' },
          { kind: 'em', inline: [{ kind: 'text', text: 'carefully' }] },
          { kind: 'text', text: ', ' },
          { kind: 'strike', inline: [{ kind: 'text', text: 'never' }] },
          { kind: 'text', text: ' ' },
          { kind: 'link', href: 'https://docs.example.com/a', inline: [{ kind: 'text', text: 'see the docs' }] },
        ],
      },
    ]);
  });

  it('AC-9: reads bold and italic together, as the converter writes them', () => {
    expect(parseMarkdown('***both***')).toEqual([
      {
        kind: 'paragraph',
        inline: [{ kind: 'strong', inline: [{ kind: 'em', inline: [{ kind: 'text', text: 'both' }] }] }],
      },
    ]);
  });

  it('AC-9: reads a fenced code block as it is, Markdown and all', () => {
    expect(parseMarkdown('```ts\nconst a = **1**;\n\nconst b = 2;\n```')).toEqual([
      { kind: 'code', language: 'ts', text: 'const a = **1**;\n\nconst b = 2;' },
    ]);
  });

  it('AC-9: reads a quote with its own blocks, and a rule', () => {
    expect(parseMarkdown('> Said in the call.\n>\n> - one\n\n---')).toEqual([
      {
        kind: 'quote',
        blocks: [
          { kind: 'paragraph', inline: [{ kind: 'text', text: 'Said in the call.' }] },
          {
            kind: 'list',
            ordered: false,
            start: 1,
            items: [{ checked: null, inline: [{ kind: 'text', text: 'one' }], blocks: [] }],
          },
        ],
      },
      { kind: 'rule' },
    ]);
  });

  it('AC-9, AC-10: reads a table with its header, and a pipe the converter escaped inside a cell', () => {
    expect(parseMarkdown('| Field | Value |\n| --- | --- |\n| a \\| b | `c` |')).toEqual([
      {
        kind: 'table',
        header: [[{ kind: 'text', text: 'Field' }], [{ kind: 'text', text: 'Value' }]],
        rows: [[[{ kind: 'text', text: 'a | b' }], [{ kind: 'code', text: 'c' }]]],
      },
    ]);
    expect(parseMarkdown('| a | b |')).toEqual([
      { kind: 'table', header: null, rows: [[[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]]] },
    ]);
  });

  it('AC-10: keeps HTML and anything else it doesn’t know as plain text', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)> **unclosed and [half](link')).toEqual([
      {
        kind: 'paragraph',
        inline: [{ kind: 'text', text: '<img src=x onerror=alert(1)> **unclosed and [half](link' }],
      },
    ]);
  });

  it('reads nothing as no blocks', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n')).toEqual([]);
  });
});

describe('safeLink', () => {
  it('AC-10: lets only http and https links through', () => {
    expect(safeLink('https://your-team.atlassian.net/browse/PROJ-1')).toBe(
      'https://your-team.atlassian.net/browse/PROJ-1',
    );
    expect(safeLink('http://example.com/')).toBe('http://example.com/');
    for (const href of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      '/relative',
      'not a url',
    ]) {
      expect(safeLink(href)).toBeNull();
    }
  });
});
