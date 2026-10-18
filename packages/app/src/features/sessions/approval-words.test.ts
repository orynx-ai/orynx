import { describe, expect, it } from 'vitest';
import type { SessionApproval } from '@devhub/contracts';
import { makeSessionApproval } from '@devhub/contracts/testing';
import {
  alwaysAllowLabel,
  alwaysAskLine,
  answerErrorLine,
  approvalButtons,
  approvalTitle,
  moreLinesText,
  needsApprovalLabel,
} from './approval-words.ts';

const edit = (creates: boolean): SessionApproval => ({
  id: 'approval-2',
  kind: 'edit',
  path: 'src/a.ts',
  creates,
  lines: [],
  moreLines: 0,
  askedAt: '2026-10-16T10:00:00.000Z',
});

describe('approval words (spec 012, Q8)', () => {
  it('AC-1, AC-8, Q8a: titles say what Claude wants to do', () => {
    expect(approvalTitle(makeSessionApproval())).toBe('Claude wants to run a command');
    expect(approvalTitle(edit(false))).toBe('Claude wants to edit a file');
    expect(approvalTitle(edit(true))).toBe('Claude wants to create a file');
  });

  it('AC-1, AC-5, Q8a: the buttons say what each answer does', () => {
    expect(approvalButtons).toEqual({ allowOnce: 'Allow once', deny: 'Deny' });
    expect(alwaysAllowLabel('npm test')).toBe('Always allow npm test');
  });

  it('AC-6, Q8b: says why a command always asks, and that allowing it runs it once outside the sandbox', () => {
    expect(alwaysAskLine('network')).toBe(
      'This reaches the network, so it always asks. If you allow it, it runs once outside the sandbox.',
    );
    expect(alwaysAskLine('delete_outside')).toBe(
      'This deletes outside the worktree, so it always asks. If you allow it, it runs once outside the sandbox.',
    );
    expect(alwaysAskLine('unsandboxed')).toBe('Claude asked to run this outside the sandbox, so it always asks.');
  });

  it('AC-14, Q8e: says what went wrong with an answer, and what to do', () => {
    expect(answerErrorLine({ kind: 'not_sent' })).toBe("Couldn't send your answer. Try again.");
    expect(answerErrorLine({ kind: 'not_saved', entry: 'npm test' })).toBe(
      "Couldn't save npm test to your allow list. Try again, or allow it once.",
    );
  });

  it('Q9: counts the lines of a change that aren’t shown', () => {
    expect(moreLinesText(12)).toBe('and 12 more lines');
    expect(moreLinesText(1)).toBe('and 1 more line');
  });

  it('AC-1, Q8d: the pill says the session needs your approval', () => {
    expect(needsApprovalLabel).toBe('Needs your approval');
  });
});
