import { describe, expect, it } from 'vitest';
import { markdownToAdf } from './markdown-adf.ts';

const text = (value: string, ...marks: ('strong' | 'code')[]) =>
  marks.length === 0
    ? { type: 'text', text: value }
    : { type: 'text', text: value, marks: marks.map((type) => ({ type })) };
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });

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
  ])('writes %s', (_, markdown, content) => {
    expect(markdownToAdf(markdown)).toEqual({ version: 1, type: 'doc', content });
  });

  it('never writes an empty text node, which Jira refuses', () => {
    expect(JSON.stringify(markdownToAdf('****\n\n``'))).not.toContain('"text":""');
  });
});
