import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  ComposerStartSchema,
  SessionSchema,
  ThreadReplyAnswerSchema,
  ThreadReplyRequestSchema,
  composerLimits,
  threadFromLink,
  ThreadPreviewAnswerSchema,
  ThreadPreviewQuerySchema,
} from './index.ts';
import { makeSession } from './testing.ts';

const slack = { kind: 'slack_thread', channel: 'C024BE91L', ts: '1700000000.123456' } as const;
const discord = {
  kind: 'discord_thread',
  guild: '1100000000000000001',
  channel: '1100000000000000002',
  message: '1100000000000000003',
} as const;

describe('threadFromLink (spec 016)', () => {
  it('AC-26: reads a Slack message link as its thread', () => {
    expect(threadFromLink('https://acme.slack.com/archives/C024BE91L/p1700000000123456')).toEqual(slack);
  });

  it('AC-26: reads a reply’s link as the thread it is in, from its thread_ts', () => {
    expect(
      threadFromLink(
        'https://acme.slack.com/archives/C024BE91L/p1700000099000001?thread_ts=1700000000.123456&cid=C024BE91L',
      ),
    ).toEqual(slack);
  });

  it('AC-26: reads a Discord message link, the app’s and the browser’s', () => {
    const path = '/channels/1100000000000000001/1100000000000000002/1100000000000000003';
    for (const host of ['discord.com', 'ptb.discord.com', 'canary.discord.com', 'discordapp.com']) {
      expect(threadFromLink(` https://${host}${path} `)).toEqual(discord);
    }
  });

  it('reads nothing else: other hosts, http, a channel without a message, or a Discord DM a bot can’t read', () => {
    for (const link of [
      'http://acme.slack.com/archives/C024BE91L/p1700000000123456',
      'https://acme.slack.com.evil.example/archives/C024BE91L/p1700000000123456',
      'https://acme.slack.com/archives/C024BE91L',
      'https://discord.com/channels/@me/1100000000000000002/1100000000000000003',
      'https://discord.com/channels/1100000000000000001/1100000000000000002',
      'https://github.com/acme/web-app/pull/1',
      'not a link',
    ]) {
      expect(threadFromLink(link)).toBeNull();
    }
  });
});

describe('thread chips (spec 016)', () => {
  const start = (context: unknown[]) => ComposerStartSchema.safeParse({ message: 'Fix it', context });

  it('AC-30: a composer start takes a Slack and a Discord thread, each with the label the page shows', () => {
    const label = { from: 'Neha K.', channel: 'web-platform', server: null };
    expect(start([{ ...slack, label }, discord]).success).toBe(true);
  });

  it('refuses the same thread twice, and more threads than the limit', () => {
    expect(start([slack, slack]).error?.issues[0]?.message).toBe('The same thread twice.');
    const many = Array.from({ length: composerLimits.threads + 1 }, (_, at) => ({
      ...slack,
      ts: `17000000${String(at).padStart(2, '0')}.000000`,
    }));
    expect(start(many).error?.issues[0]?.message).toBe(`${String(composerLimits.threads)} threads at most.`);
  });
});

describe('thread preview (spec 016)', () => {
  it('AC-26, AC-27: answers the thread with who and where, or why there is none', () => {
    const found = {
      result: 'found',
      chip: slack,
      label: { from: 'Neha K.', channel: 'web-platform', server: null },
    };
    expect(ThreadPreviewAnswerSchema.parse(found)).toEqual(found);
    expect(ThreadPreviewAnswerSchema.parse({ result: 'not_connected', tool: 'discord' })).toEqual({
      result: 'not_connected',
      tool: 'discord',
    });
    expect(ThreadPreviewAnswerSchema.parse({ result: 'not_found' })).toEqual({ result: 'not_found' });
  });

  it('takes the link as pasted, and lives at /api/threads/preview', () => {
    expect(ThreadPreviewQuerySchema.parse({ link: 'https://acme.slack.com/x' })).toEqual({
      link: 'https://acme.slack.com/x',
    });
    expect(ThreadPreviewQuerySchema.safeParse({ link: 'a'.repeat(2049) }).success).toBe(false);
    expect(apiRoutes.threadPreview).toBe('/api/threads/preview');
  });
});

describe('a reply in the thread (spec 016, E)', () => {
  it('AC-40: takes the reply you edited, trimmed, up to 2,000 characters', () => {
    expect(ThreadReplyRequestSchema.parse({ text: ' A fix is up for review. ' })).toEqual({
      text: 'A fix is up for review.',
    });
    expect(ThreadReplyRequestSchema.safeParse({ text: '  ' }).success).toBe(false);
    expect(ThreadReplyRequestSchema.safeParse({ text: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('AC-41, AC-42: answers where it was posted, or the tool’s own words', () => {
    const posted = { result: 'posted', url: 'https://acme.slack.com/archives/C024BE91L/p1700000100000001' };
    expect(ThreadReplyAnswerSchema.parse(posted)).toEqual(posted);
    const failed = { result: 'failed', reason: 'is_archived' };
    expect(ThreadReplyAnswerSchema.parse(failed)).toEqual(failed);
    expect(ThreadReplyAnswerSchema.safeParse({ result: 'posted', url: 'https://example.com/x' }).success).toBe(false);
  });

  it('AC-41, AC-43, AC-44: a session keeps whether its reply was posted or put off, none by default', () => {
    expect(makeSession().threadReply).toBeNull();
    const posted = {
      state: 'posted',
      url: 'https://acme.slack.com/archives/C024BE91L/p1700000100000001',
      channel: 'web-platform',
    } as const;
    expect(SessionSchema.parse({ ...makeSession(), threadReply: posted }).threadReply).toEqual(posted);
    expect(SessionSchema.parse({ ...makeSession(), threadReply: { state: 'dismissed' } }).threadReply).toEqual({
      state: 'dismissed',
    });
  });

  it('AC-40: a session’s pull request keeps its title, which one saved before spec 016 has none of', () => {
    const pullRequest = {
      number: 2841,
      url: 'https://github.com/acme/web-app/pull/2841',
      repository: 'acme/web-app',
      openedAt: '2026-11-02T10:00:00.000Z',
    };
    const parse = (pull: object) => SessionSchema.parse({ ...makeSession(), pullRequest: pull }).pullRequest;
    expect(parse({ ...pullRequest, title: 'Fix the archive API' })?.title).toBe('Fix the archive API');
    expect(parse(pullRequest)?.title).toBeUndefined();
  });

  it('lives at /api/sessions/:id/thread-reply, with dismiss beside it', () => {
    expect(apiRoutes.sessionThreadReply).toBe('/api/sessions/:id/thread-reply');
    expect(apiRoutes.sessionThreadReplyDismiss).toBe('/api/sessions/:id/thread-reply/dismiss');
  });
});
