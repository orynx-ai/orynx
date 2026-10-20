import { describe, expect, it } from 'vitest';
import { lastLines, plainLines } from './output.ts';

describe('plainLines', () => {
  it('AC-16: removes colour and cursor codes, as tools print them for a terminal', () => {
    expect(plainLines('\u001b[1;32m✓\u001b[0m passed\n\u001b]0;title\u0007done\n\u001b(Bok')).toEqual([
      '✓ passed',
      'done',
      'ok',
    ]);
  });

  it('AC-16: shows a line rewritten with a carriage return as its last version, and takes Windows line ends', () => {
    expect(plainLines('downloading 10%\rdownloading 100%\r\nready\r\n')).toEqual(['downloading 100%', 'ready']);
  });

  it('keeps empty lines between lines, but not the newline at the end', () => {
    expect(plainLines('a\n\nb\n')).toEqual(['a', '', 'b']);
    expect(plainLines('')).toEqual([]);
  });
});

describe('lastLines', () => {
  it('AC-16: keeps the last lines and says when some were dropped', () => {
    expect(lastLines('1\n2\n3', 2)).toEqual({ output: ['2', '3'], cut: true });
    expect(lastLines('1\n2', 2)).toEqual({ output: ['1', '2'], cut: false });
  });
});
