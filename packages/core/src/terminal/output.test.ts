import { describe, expect, it } from 'vitest';
import { createOutputBuffer, lastLines, plainLines } from './output.ts';

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

describe('createOutputBuffer', () => {
  it('AC-8: shows output as it comes, joining a line split across chunks, with the unfinished line last', () => {
    const buffer = createOutputBuffer(10);
    buffer.add('VITE v5 re');
    expect(buffer.read()).toEqual({ output: ['VITE v5 re'], cut: false });
    buffer.add('ady\n  ➜  Local: http://localhost:5173/\n');
    expect(buffer.read()).toEqual({ output: ['VITE v5 ready', '  ➜  Local: http://localhost:5173/'], cut: false });
  });

  it('AC-16: keeps only the last lines once there are more, and says so', () => {
    const buffer = createOutputBuffer(3);
    buffer.add(Array.from({ length: 50_000 }, (_, n) => String(n)).join('\n'));
    buffer.add('\n');
    expect(buffer.read()).toEqual({ output: ['49997', '49998', '49999'], cut: true });
  });

  it('AC-16: breaks a line that never ends, so a stream with no newline can’t grow without end', () => {
    const buffer = createOutputBuffer(3, 4);
    buffer.add('yyyyyyyyyy');
    expect(buffer.read()).toEqual({ output: ['yyyy', 'yyyy', 'yy'], cut: false });
  });

  it('AC-16: removes colour codes and keeps a rewritten line’s last version, as plainLines does', () => {
    const buffer = createOutputBuffer(10);
    buffer.add('\u001b[32m 10%\r 100%\u001b[0m\n');
    expect(buffer.read().output).toEqual([' 100%']);
  });
});
