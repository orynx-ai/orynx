import { describe, expect, it } from 'vitest';
import { markdownToAdf } from './markdown-adf.ts';

const text = (value: string, ...marks: ('strong' | 'code' | 'em')[]) =>
  marks.length === 0
    ? { type: 'text', text: value }
    : { type: 'text', text: value, marks: marks.map((type) => ({ type })) };
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const link = (value: string, href: string) => ({
  type: 'text',
  text: value,
  marks: [{ type: 'link', attrs: { href } }],
});

describe('markdownToAdf (spec 044)', () => {
  it.each([
    [
      'a paragraph, its lines joined by breaks',
      'One line\nnext line',
      [paragraph(text('One line'), { type: 'hardBreak' }, text('next line'))],
    ],
    ['paragraphs apart', 'First\n\nSecond', [paragraph(text('First')), paragraph(text('Second'))]],
    ['a heading at its level', '## Fixed in', [{ type: 'heading', attrs: { level: 2 }, content: [text('Fixed in')] }]],
    [
      'bold and code inside a line',
      'See **MAG-12** in `src/app.ts`.',
      [paragraph(text('See '), text('MAG-12', 'strong'), text(' in '), text('src/app.ts', 'code'), text('.'))],
    ],
    [
      'a bullet list',
      '- one\n* two',
      [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph(text('one'))] },
            { type: 'listItem', content: [paragraph(text('two'))] },
          ],
        },
      ],
    ],
    [
      'a numbered list',
      '1. first\n2. second',
      [
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [paragraph(text('first'))] },
            { type: 'listItem', content: [paragraph(text('second'))] },
          ],
        },
      ],
    ],
    [
      'fenced code, with its language',
      '```ts\nconst a = 1;\n\nconst b = 2;\n```',
      [{ type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;\n\nconst b = 2;')] }],
    ],
    ['an unclosed mark as its text', 'a ** b and `c', [paragraph(text('a ** b and `c'))]],
    [
      'AC-13: a link, its text marked',
      'See [the PR](https://github.com/acme/web/pull/2) or [mail](mailto:dev@example.com).',
      [
        paragraph(
          text('See '),
          link('the PR', 'https://github.com/acme/web/pull/2'),
          text(' or '),
          link('mail', 'mailto:dev@example.com'),
          text('.'),
        ),
      ],
    ],
    [
      'AC-13: a link to anything but http, https or mailto as its text',
      '[x](javascript:alert(1)) and [y](file:///etc/hosts)',
      [paragraph(text('[x](javascript:alert(1)) and [y](file:///etc/hosts)'))],
    ],
    [
      'AC-13: italics, with * or _',
      '*one* and _two_',
      [paragraph(text('one', 'em'), text(' and '), text('two', 'em'))],
    ],
    [
      'AC-13: underscores inside a word, and a lone star, as their text',
      'use snake_case_names and 2 * 3 * 4',
      [paragraph(text('use snake_case_names and 2 * 3 * 4'))],
    ],
    [
      'AC-13: a quote, up to the first line that isn’t one',
      '> Fixed in main.\n> See **the PR**.\nThanks',
      [
        {
          type: 'blockquote',
          content: [
            paragraph(text('Fixed in main.'), { type: 'hardBreak' }, text('See '), text('the PR', 'strong'), text('.')),
          ],
        },
        paragraph(text('Thanks')),
      ],
    ],
  ])('writes %s', (_, markdown, content) => {
    expect(markdownToAdf(markdown)).toEqual({ version: 1, type: 'doc', content });
  });

  it('never writes an empty text node, which Jira refuses', () => {
    expect(JSON.stringify(markdownToAdf('****\n\n``'))).not.toContain('"text":""');
  });
});
