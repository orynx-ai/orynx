import { describe, expect, it } from 'vitest';
import { apiRoutes, InboxItemSchema, InboxSchema, InboxToolStateSchema, ServerEventSchema } from './index.ts';
import { makeInbox, makeInboxItem, makeSlackItem } from './testing.ts';

describe('InboxSchema', () => {
  it('AC-1: carries the rows in the order the server sorted them, each tool’s sync state and the sync time', () => {
    const inbox = makeInbox({
      items: [
        makeInboxItem({ id: 'github:acme/web-app#2841', waitingSince: '2026-10-15T09:00:00.000Z' }),
        makeInboxItem({
          id: 'jira:PROJ-1377',
          source: 'jira',
          tab: 'jira',
          title: 'Search returns archived sites for guest users',
          subject: { kind: 'issue', key: 'PROJ-1377', status: 'In progress', highPriorityBug: true },
          reason: { kind: 'due', on: '2026-10-19', highPriorityBug: true },
          waitingSince: '2026-10-16T09:00:00.000Z',
          target: { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-1377' },
        }),
      ],
    });

    const parsed = InboxSchema.parse(inbox);

    expect(parsed.items.map((item) => item.id)).toEqual(['github:acme/web-app#2841', 'jira:PROJ-1377']);
    expect(parsed.tools.jira).toEqual({ state: 'synced', at: '2026-10-17T10:00:00.000Z' });
    expect(parsed.syncedAt).toBe('2026-10-17T10:00:00.000Z');
  });

  it('AC-12: a row can open a Claude session inside DevHub instead of a link out', () => {
    const row = makeInboxItem({
      reason: { kind: 'approval' },
      subject: { kind: 'session', source: { kind: 'jira', key: 'PROJ-1423' } },
      target: { kind: 'session', sessionId: 'session-1' },
    });

    expect(InboxItemSchema.parse(row).target).toEqual({ kind: 'session', sessionId: 'session-1' });
  });

  it('AC-6, AC-7 (spec 047): a pull request row can say it comes from a fork; a row cached before can’t', () => {
    const subject = { kind: 'pull_request', repository: 'web-app', number: 2836, author: null, mine: true } as const;

    expect(InboxItemSchema.parse(makeInboxItem({ subject: { ...subject, fork: true } })).subject).toMatchObject({
      fork: true,
    });
    expect(InboxItemSchema.parse(makeInboxItem({ subject })).subject).not.toHaveProperty('fork');
  });

  it('links out only to https on github.com or a Jira Cloud site, so a row can never send you elsewhere', () => {
    for (const url of ['https://github.com/acme/web-app/pull/1', 'https://your-team.atlassian.net/browse/PROJ-1']) {
      expect(InboxItemSchema.safeParse({ ...makeInboxItem(), target: { kind: 'external', url } }).success).toBe(true);
    }
    for (const url of [
      'javascript:alert(1)',
      'http://github.com/acme/web-app/pull/1',
      'not a link',
      'https://github.com@evil.example/acme/web-app/pull/1',
      'https:evil.example',
      'https://github.com.evil.example/pull/1',
      'https://atlassian.net.evil.example/browse/PROJ-1',
    ]) {
      expect(InboxItemSchema.safeParse({ ...makeInboxItem(), target: { kind: 'external', url } }).success).toBe(false);
    }
  });

  it('016 AC-10, AC-11: a Slack message waiting on your reply, in a channel or a DM, links to Slack', () => {
    const inChannel = makeSlackItem();
    expect(InboxItemSchema.parse(inChannel)).toEqual(inChannel);
    const direct = makeSlackItem({ subject: { kind: 'message', from: 'Arjun M.', channel: null, server: null } });
    expect(InboxItemSchema.parse(direct).subject).toEqual({
      kind: 'message',
      from: 'Arjun M.',
      channel: null,
      server: null,
    });
  });

  it('016 AC-16: a Discord message names its server, and links to discord.com', () => {
    const item = makeSlackItem({
      id: 'discord:1100000000000000003',
      source: 'discord',
      tab: 'discord',
      subject: { kind: 'message', from: 'Neha K.', channel: 'web-platform', server: 'Acme' },
      target: {
        kind: 'external',
        url: 'https://discord.com/channels/1100000000000000001/1100000000000000002/1100000000000000003',
      },
    });
    expect(InboxItemSchema.parse(item)).toEqual(item);
  });

  it('016: links to Slack and Discord only on their own https hosts', () => {
    for (const url of [
      'http://acme.slack.com/archives/C024BE91L/p1700000000123456',
      'https://acme.slack.com.evil.example/archives/C1/p1',
      'https://slack.com@evil.example/archives/C1/p1',
      'https://discord.com.evil.example/channels/1/2/3',
      'https://discordapp.example/channels/1/2/3',
    ]) {
      expect(InboxItemSchema.safeParse({ ...makeSlackItem(), target: { kind: 'external', url } }).success).toBe(false);
    }
  });

  it('016 AC-20: carries Slack’s and Discord’s sync states beside Jira’s and GitHub’s', () => {
    const inbox = makeInbox();
    expect(inbox.tools.slack).toEqual({ state: 'not_connected' });
    expect(inbox.tools.discord).toEqual({ state: 'not_connected' });
    const { slack: _left, ...withoutSlack } = inbox.tools;
    expect(InboxSchema.safeParse({ ...inbox, tools: withoutSlack }).success).toBe(false);
  });

  it('keeps a due date as a calendar day, because the app works out "Due Mon" in the laptop’s own calendar', () => {
    const due = (on: string) =>
      InboxItemSchema.safeParse({ ...makeInboxItem(), reason: { kind: 'due', on, highPriorityBug: false } }).success;

    expect(due('2026-10-19')).toBe(true);
    expect(due('2026-10-19T00:00:00.000Z')).toBe(false);
  });

  it('AC-24, AC-25: a failed tool keeps the time of its last good sync next to what went wrong', () => {
    const states = [
      { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: '2026-10-17T09:48:00.000Z' },
      { state: 'failed', problem: { kind: 'rate_limited', until: '2026-10-17T14:05:00.000Z' }, lastSyncedAt: null },
      { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: null },
      { state: 'failed', problem: { kind: 'sign_in_needed', site: 'your-team.atlassian.net' }, lastSyncedAt: null },
      { state: 'failed', problem: { kind: 'other', message: 'gh is signed out.' }, lastSyncedAt: null },
      { state: 'not_connected' },
      { state: 'syncing' },
    ];

    for (const state of states) expect(InboxToolStateSchema.parse(state)).toEqual(state);
  });

  it('has a path for the list, for Refresh and for Clear cache', () => {
    expect(apiRoutes.inbox).toBe('/api/inbox');
    expect(apiRoutes.inboxRefresh).toBe('/api/inbox/refresh');
    expect(apiRoutes.inboxCache).toBe('/api/inbox/cache');
  });

  it('AC-16: tells open pages when the list changed', () => {
    expect(ServerEventSchema.parse({ type: 'inbox.changed' })).toEqual({ type: 'inbox.changed' });
  });
});
