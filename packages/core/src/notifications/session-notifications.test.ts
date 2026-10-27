import { describe, expect, it } from 'vitest';
import { makeSession, makeSessionApproval } from '@devhub/contracts/testing';
import { approvalNotificationId, sessionNotifications } from './session-notifications.ts';

const working = makeSession({ id: '00000000000000aa', title: 'Add bulk archive', state: 'working' });
const session = { id: '00000000000000aa', title: 'Add bulk archive', source: { kind: 'jira', key: 'PROJ-1423' } };

describe('the notifications a session change raises (spec 029)', () => {
  it('AC-19: Claude waiting to run a command raises one, with the command', () => {
    const asked = { ...working, state: 'needs_you' as const, approvals: [makeSessionApproval({ id: 'call-1' })] };

    expect(sessionNotifications(working, asked)).toEqual({
      added: [
        {
          id: approvalNotificationId('00000000000000aa', 'call-1'),
          what: {
            kind: 'approval',
            session,
            approvalId: 'call-1',
            about: 'command',
            command: 'npm test -- content-list',
            waiting: true,
          },
        },
      ],
      ended: [],
    });
  });

  it('AC-11, AC-19: an edit, a push and a pull request say what they are', () => {
    const edit = {
      id: 'call-2',
      kind: 'edit' as const,
      path: 'src/list.ts',
      creates: false,
      lines: [],
      moreLines: 0,
      askedAt: '2026-10-19T10:00:00.000Z',
    };
    const push = makeSessionApproval({ id: 'call-3', command: 'git push origin feat/x', alwaysAsk: 'push' });
    const pr = makeSessionApproval({ id: 'call-4', command: 'gh pr create', alwaysAsk: 'pull_request' });
    const asked = { ...working, state: 'needs_you' as const, approvals: [edit, push, pr] };

    const abouts = sessionNotifications(working, asked).added.map(({ what }) =>
      what.kind === 'approval' ? [what.about, what.command] : null,
    );
    expect(abouts).toEqual([
      ['edit', null],
      ['push', 'git push origin feat/x'],
      ['pull_request', 'gh pr create'],
    ]);
  });

  it('AC-30 (spec 037): Claude asking to delete an Orynx ticket says so, with no command', () => {
    const ticket = {
      id: 'call-5',
      kind: 'ticket' as const,
      key: 'ORX-7',
      title: 'Flaky date test',
      askedAt: '2026-10-20T10:00:00.000Z',
    };
    const asked = { ...working, state: 'needs_you' as const, approvals: [ticket] };

    expect(sessionNotifications(working, asked).added[0]?.what).toEqual({
      kind: 'approval',
      session,
      approvalId: 'call-5',
      about: 'ticket',
      command: null,
      waiting: true,
    });
  });

  it('AC-12: an answered or dropped call ends its notification and raises nothing new', () => {
    const asked = { ...working, state: 'needs_you' as const, approvals: [makeSessionApproval({ id: 'call-1' })] };

    expect(sessionNotifications(asked, working)).toEqual({
      added: [],
      ended: [approvalNotificationId('00000000000000aa', 'call-1')],
    });
  });

  it('AC-19: finishing, stopping, failing and the usage limit each raise one', () => {
    const endedAt = '2026-10-19T10:30:00.000Z';
    const kinds = [
      { ...working, state: 'done' as const, endedAt },
      { ...working, state: 'stopped' as const, endedAt },
      {
        ...working,
        state: 'stopped' as const,
        endedAt,
        problem: { kind: 'other' as const, stage: 'working' as const },
      },
      {
        ...working,
        state: 'stopped' as const,
        endedAt,
        problem: { kind: 'limit' as const, stage: 'working' as const },
      },
    ].map((after) => sessionNotifications(working, after).added.map(({ what }) => what.kind));

    expect(kinds).toEqual([['session_finished'], ['session_stopped'], ['session_failed'], ['session_limit']]);
  });

  it('says what the finished session is ready for, from what Claude did (spec 031)', () => {
    const edited = [{ id: 'step-1', state: 'done' as const, kind: 'edit' as const, files: ['src/ContentList.tsx'] }];
    const ended = { state: 'done' as const, endedAt: '2026-10-19T10:30:00.000Z' };
    const ready = [
      { ...working, ...ended, activities: edited },
      { ...working, ...ended, activities: edited, workOn: 'pull_request' as const },
      { ...working, ...ended, mode: 'ask' as const },
      // AC-10 (spec 048): a file only a command Claude ran changed.
      { ...working, ...ended, changed: true },
      { ...working, ...ended, changed: true, workOn: 'pull_request' as const },
      { ...working, ...ended },
    ].map((after) =>
      sessionNotifications(working, after).added.map(({ what }) => ('ready' in what ? what.ready : null)),
    );

    expect(ready).toEqual([['pull_request'], ['push'], ['nothing'], ['pull_request'], ['push'], ['nothing']]);
  });

  it('a follow-up that finishes again raises a second notification, under its own id', () => {
    const first = sessionNotifications(working, { ...working, state: 'done', endedAt: '2026-10-19T10:30:00.000Z' });
    const again = sessionNotifications(working, { ...working, state: 'done', endedAt: '2026-10-19T11:30:00.000Z' });

    expect(first.added[0]?.id).not.toBe(again.added[0]?.id);
  });

  it('AC-20: a session with no ticket names itself alone', () => {
    const composer = { ...working, source: null };
    const [notice] = sessionNotifications(composer, { ...composer, state: 'done' }).added;

    expect(notice?.what).toEqual({ kind: 'session_finished', session: { ...session, source: null }, ready: 'nothing' });
  });

  it('Discard, closing Orynx and a pull request opening raise nothing', () => {
    const asked = { ...working, state: 'needs_you' as const, approvals: [makeSessionApproval({ id: 'call-1' })] };
    const halted = { ...working, state: 'stopped' as const };

    expect(sessionNotifications(asked, halted, { quiet: true })).toEqual({
      added: [],
      ended: [approvalNotificationId('00000000000000aa', 'call-1')],
    });
    expect(sessionNotifications(halted, { ...halted, discardedAt: '2026-10-19T11:00:00.000Z' }).added).toEqual([]);
    const done = { ...working, state: 'done' as const };
    expect(sessionNotifications(done, { ...done, state: 'pr_open' }).added).toEqual([]);
    expect(sessionNotifications(working, { ...working, title: 'Renamed' }).added).toEqual([]);
  });
});
