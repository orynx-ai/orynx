import { describe, expect, it } from 'vitest';
import { makeSyncChange, makeSyncRun, makeSyncTool } from '@devhub/contracts/testing';
import {
  activityHeadline,
  buttonName,
  failingLine,
  problemWords,
  runSummary,
  statusLine,
  syncStats,
  timeText,
  tookText,
  toolLine,
} from './sync-words.ts';

/** 20 Oct 2026 at a local 10:44, so clock times read the same on every computer. */
const now = new Date(2026, 9, 20, 10, 44);
const at = (hours: number, minutes: number, date = 20) => new Date(2026, 9, date, hours, minutes).toISOString();
const failing = makeSyncTool({
  state: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: at(9, 40) },
  lastSyncAt: at(9, 57),
  lastGoodSyncAt: at(9, 40),
  failingSince: at(9, 42),
  failedInARow: 3,
});
const fine = makeSyncTool({ tool: 'github', lastSyncAt: at(10, 41), lastGoodSyncAt: at(10, 41) });
const off = makeSyncTool({
  tool: 'github',
  state: { state: 'not_connected' },
  lastSyncAt: null,
  lastGoodSyncAt: null,
});

describe('sync activity words (spec 035, Q3)', () => {
  it('AC-10: a refused token asks for a reconnect, in red', () => {
    expect(problemWords('jira', { kind: 'rejected' })).toEqual({
      title: 'Jira refused Orynx’s saved token.',
      fix: 'Reconnect to fix it. Syncing again won’t help.',
      tone: 'danger',
      reconnect: true,
    });
    expect(problemWords('jira', { kind: 'sign_in_needed', site: 'your-team.atlassian.net' })).toEqual({
      title: 'Jira wants you to sign in on the web first.',
      fix: 'Sign in at your-team.atlassian.net, then press Retry.',
      tone: 'danger',
      reconnect: false,
    });
  });

  it('AC-11: a failure that fixes itself says so, in amber, with no reconnect', () => {
    expect(problemWords('github', { kind: 'rate_limited', until: at(10, 50) })).toEqual({
      title: 'GitHub’s rate limit is used up until 10:50.',
      fix: 'Orynx syncs again after that. Nothing for you to do.',
      tone: 'warning',
      reconnect: false,
    });
    expect(problemWords('github', { kind: 'rate_limited', until: null }).title).toBe('GitHub’s rate limit is used up.');
    expect(problemWords('jira', { kind: 'no_answer' })).toMatchObject({
      title: 'Jira didn’t answer.',
      fix: 'Orynx tries again at the next sync, in 2 min.',
    });
    expect(problemWords('jira', { kind: 'other', message: 'gh is signed out.' })).toMatchObject({
      title: 'gh is signed out.',
      tone: 'warning',
    });
  });

  it('AC-10, AC-21: says since when a tool fails, and how many syncs failed', () => {
    expect(failingLine(failing)).toBe('Failing since 09:42 · 3 failed syncs');
    expect(failingLine({ ...failing, failedInARow: 1 })).toBe('Failing since 09:42 · 1 failed sync');
  });

  it('AC-12: sums up a run', () => {
    expect(runSummary(makeSyncRun({ problem: { kind: 'rejected' } }))).toBe('Failed · token refused');
    expect(runSummary(makeSyncRun({ problem: { kind: 'sign_in_needed', site: 'x.atlassian.net' } }))).toBe(
      'Failed · sign-in needed',
    );
    expect(runSummary(makeSyncRun({ problem: { kind: 'rate_limited', until: null } }))).toBe('Failed · rate limit');
    expect(runSummary(makeSyncRun({ problem: { kind: 'no_answer' } }))).toBe('Failed · no answer');
    expect(runSummary(makeSyncRun({ problem: { kind: 'other', message: 'Odd' } }))).toBe('Failed');
    expect(runSummary(makeSyncRun())).toBe('No changes');
    const changes = [
      makeSyncChange(),
      makeSyncChange({ ref: 'PROJ-2' }),
      makeSyncChange({ kind: 'updated' }),
      makeSyncChange({ kind: 'removed' }),
    ];
    expect(runSummary(makeSyncRun({ changes }))).toBe('2 new · 1 updated · 1 removed');
    expect(runSummary(makeSyncRun({ changes: [makeSyncChange()], moreChanges: 40 }))).toBe('1 new · 40 more');
  });

  it('AC-5, AC-6, AC-7: the head counts the connected tools, those that need attention, and the rest', () => {
    expect(activityHeadline([failing, fine])).toBe('2 connected · 1 needs attention');
    expect(activityHeadline([fine, { ...fine, tool: 'jira' }])).toBe('2 connected · all syncing fine');
    expect(activityHeadline([failing, off])).toBe('1 connected · 1 needs attention · 1 not connected');
    expect(activityHeadline([failing, { ...failing, tool: 'github' }])).toBe('2 connected · 2 need attention');
  });

  it('AC-2: the button says how many tools need attention', () => {
    expect(buttonName(0)).toBe('Sync activity');
    expect(buttonName(1)).toBe('Sync activity, 1 needs attention');
    expect(buttonName(2)).toBe('Sync activity, 2 need attention');
  });

  it('AC-8: a tool’s line in the list, and its state for a screen reader', () => {
    expect(toolLine(failing)).toEqual({ line: 'Failing since 09:42', state: 'Failing', tone: 'danger' });
    expect(toolLine(fine)).toEqual({ line: 'Synced 10:41', state: 'Syncing fine', tone: 'success' });
    expect(toolLine(off)).toEqual({ line: 'Not connected', state: 'Not connected', tone: 'off' });
    expect(toolLine({ ...fine, state: { state: 'syncing' }, lastSyncAt: null }).line).toBe('Not synced yet');
  });

  it('AC-7, AC-9, AC-10: the detail’s status line', () => {
    expect(statusLine(fine)).toBe('Syncing fine · last sync 10:41');
    expect(statusLine(failing)).toBe('Failing · last good sync 09:40');
    expect(statusLine({ ...failing, lastGoodSyncAt: null })).toBe('Failing');
    expect(statusLine(off)).toBe('Not connected. Nothing is synced.');
  });

  it('AC-9: the stats, with the next sync 2 minutes after the last', () => {
    expect(syncStats(fine, now)).toEqual([
      { term: 'Last good sync', detail: '10:41' },
      { term: 'Next sync', detail: '10:43' },
      { term: 'Changes today', detail: '14' },
      { term: 'Success, last 2 h', detail: '60 of 60' },
    ]);
    expect(syncStats({ ...fine, lastSyncAt: null, lastGoodSyncAt: null }, now).slice(0, 2)).toEqual([
      { term: 'Last good sync', detail: 'None yet' },
      { term: 'Next sync', detail: 'Soon' },
    ]);
  });

  it('AC-12: times are the clock today and carry the date before, and durations are in seconds', () => {
    expect(timeText(at(9, 57), now)).toBe('09:57');
    expect(timeText(at(9, 57, 19), now)).toBe('19 Oct 09:57');
    expect(tookText(1240)).toBe('1.2s');
    expect(tookText(0)).toBe('0.0s');
  });
});
