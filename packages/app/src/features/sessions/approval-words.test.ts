import { describe, expect, it } from 'vitest';
import type { SessionApproval } from '@devhub/contracts';
import { makeSessionApproval } from '@devhub/contracts/testing';
import {
  alwaysAllowLabel,
  alwaysAskLine,
  answerErrorLine,
  approvalButtons,
  approvalTitle,
  jiraMoveLine,
  moreLinesText,
  needsApprovalLabel,
  ticketDeleteLine,
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
  it('AC-30 (spec 037, Q12i): a ticket’s delete says which ticket', () => {
    const ticket = { id: 'approval-3', kind: 'ticket', key: 'ORX-7', askedAt: '2026-10-20T10:00:00.000Z' } as const;
    expect(approvalTitle({ ...ticket, title: 'Flaky date test' })).toBe('Claude wants to delete a ticket');
    expect(ticketDeleteLine({ ...ticket, title: 'Flaky date test' })).toBe('Delete ORX-7 · Flaky date test?');
    expect(ticketDeleteLine({ ...ticket, title: null })).toBe('Delete ORX-7?');
  });

  it('AC-1, AC-8, Q8a: titles say what Claude wants to do', () => {
    expect(approvalTitle(makeSessionApproval())).toBe('Claude wants to run a command');
    expect(approvalTitle(edit(false))).toBe('Claude wants to edit a file');
    expect(approvalTitle(edit(true))).toBe('Claude wants to create a file');
  });

  it('AC-1, AC-5, Q8a: the buttons say what each answer does', () => {
    expect(approvalButtons).toEqual({
      allowOnce: 'Allow once',
      deny: 'Deny',
      alwaysServer: 'Always allow in this repository',
      alwaysJira: 'Always allow Jira changes',
    });
    expect(alwaysAllowLabel('npm test')).toBe('Always allow npm test');
  });

  it('Q10 (spec 044): says which Jira change Claude wants, by its issue', () => {
    const jira = (change: Extract<SessionApproval, { kind: 'jira' }>['change']): SessionApproval => ({
      id: 'approval-1',
      askedAt: '2026-10-22T10:00:00.000Z',
      kind: 'jira',
      key: 'MAG-12',
      change,
    });
    expect(approvalTitle(jira({ action: 'comment', text: 'Fixed.' }))).toBe('Claude wants to comment on MAG-12');
    expect(approvalTitle(jira({ action: 'transition', from: null, to: 'Done' }))).toBe(
      'Claude wants to move MAG-12 to Done',
    );
    expect(approvalTitle(jira({ action: 'assign', to: 'me' }))).toBe('Claude wants to assign MAG-12 to you');
    expect(approvalTitle(jira({ action: 'assign', to: 'nobody' }))).toBe('Claude wants to unassign MAG-12');
    expect(jiraMoveLine({ action: 'transition', from: null, to: 'Done' })).toBe('Its status → Done');
  });

  it('AC-6, Q8b, spec 026: says why a command asks first, and that allowing it runs it once outside the sandbox', () => {
    expect(alwaysAskLine('network')).toBe(
      'This reaches the network, so it asks first. If you allow it, it runs once outside the sandbox.',
    );
    expect(alwaysAskLine('delete_outside')).toBe(
      'This deletes outside the worktree, so it asks first. If you allow it, it runs once outside the sandbox.',
    );
    expect(alwaysAskLine('unsandboxed')).toBe('Claude asked to run this outside the sandbox, so it asks first.');
    expect(alwaysAskLine('push')).toBe(
      'This pushes the branch to GitHub, so it asks first. If you allow it, it runs once outside the sandbox.',
    );
    expect(alwaysAskLine('pull_request')).toBe(
      'This opens a pull request on GitHub, so it asks first. If you allow it, it runs once outside the sandbox.',
    );
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
