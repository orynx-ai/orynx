import { describe, expect, it } from 'vitest';
import { fixMessage } from './ask-to-fix.ts';

const failed = (output: string[], command = 'pnpm test') =>
  ({ id: 'block-1', state: 'failed', command, output, cut: false, exitCode: 1, ms: 3100 }) as const;

describe('fixMessage', () => {
  it('AC-17: names the command and its exit code, with its output in a code block, then asks for the fix', () => {
    expect(fixMessage(failed([' FAIL  src/a.test.ts', 'Tests: 1 failed']))).toBe(
      [
        'I ran `pnpm test` in the worktree and it failed with exit 1. Its output:',
        '```',
        ' FAIL  src/a.test.ts',
        'Tests: 1 failed',
        '```',
        'Fix it.',
      ].join('\n'),
    );
  });

  it('AC-17: sends only the last 50 lines, and says so', () => {
    const output = Array.from({ length: 80 }, (_, line) => `line ${String(line + 1)}`);
    const message = fixMessage(failed(output));
    expect(message).toContain('The last 50 lines of its output:');
    expect(fixMessage({ ...failed(['only this']), cut: true })).toContain('The last line of its output:');
    expect(message).toContain('line 31\n');
    expect(message).not.toContain('line 30\n');
  });

  it('AC-17: drops lines from the top until the message fits in a follow-up', () => {
    const output = Array.from({ length: 50 }, (_, line) => `${String(line)} ${'x'.repeat(400)}`);
    const message = fixMessage(failed(output));
    expect(message.length).toBeLessThanOrEqual(10_000);
    expect(message).toContain(`49 ${'x'.repeat(400)}`);
  });

  it('AC-17: fences the output and the command so backticks in them can’t end their code', () => {
    const message = fixMessage(failed(['```', 'printed fences'], 'echo `date`'));
    expect(message.startsWith('I ran `` echo `date` `` in the worktree')).toBe(true);
    expect(message).toContain('\n````\n```\nprinted fences\n````\n');
  });

  it('AC-17: says when the command printed nothing', () => {
    expect(fixMessage(failed([]))).toBe(
      'I ran `pnpm test` in the worktree and it failed with exit 1. It printed nothing.\nFix it.',
    );
  });
});
