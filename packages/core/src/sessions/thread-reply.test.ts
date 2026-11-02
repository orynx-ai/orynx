import { describe, expect, it } from 'vitest';
import type { ComposerChip, Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { createDiscordClient } from '../integrations/discord/client.ts';
import { createSlackClient } from '../integrations/slack/client.ts';
import { discordPosts, discordToken, discordUserId, useFakeDiscord } from '../test/fake-discord.ts';
import { slackPosts, slackToken, slackUserId } from '../test/fake-slack.ts';
import { createMemorySessionStore, StoredSessionSchema } from './session-store.ts';
import { createThreadReplies } from './thread-reply.ts';

// One MSW server for both outside services: Discord's helper, with Slack's posts added per test.
const outside = useFakeDiscord();
const id = '0000000000000001';
const slackThread: ComposerChip = {
  kind: 'slack_thread',
  channel: 'C024BE91L',
  ts: '1793613600.000100',
  label: { from: 'Neha K.', channel: 'web-platform', server: null },
};
const discordThread: ComposerChip = {
  kind: 'discord_thread',
  guild: '1100000000000000001',
  channel: '1100000000000000002',
  message: '1434477000000000001',
};
const pullRequest = {
  number: 2841,
  url: 'https://github.com/acme/web-app/pull/2841',
  repository: 'acme/web-app',
  openedAt: '2026-11-02T10:00:00.000Z',
  title: 'Fix the archive API',
};

async function setUp(session: Partial<Session>, { connected = true } = {}) {
  const records = createMemorySessionStore();
  await records.create(
    StoredSessionSchema.parse({
      session: makeSession({ id, state: 'pr_open', pullRequest, context: [slackThread], ...session }),
      repository: null,
      worktree: null,
      startCommit: null,
      claudeSessionId: null,
    }),
  );
  const replies = createThreadReplies({
    records,
    save: (sessionId, change) => records.update(sessionId, change),
    slack: {
      client: createSlackClient({ timeoutMs: 300 }),
      connection: {
        credentials: () =>
          Promise.resolve(
            connected
              ? {
                  ok: true,
                  connection: 'acme',
                  token: slackToken,
                  saved: { workspace: 'Acme', url: 'https://acme.slack.com/', userId: slackUserId, name: 'Rakesh D.' },
                }
              : null,
          ),
      },
    },
    discord: {
      client: createDiscordClient({ timeoutMs: 300 }),
      connection: {
        credentials: () =>
          Promise.resolve({
            ok: true,
            connection: 'discord',
            token: discordToken,
            saved: { bot: 'Orynx', userId: discordUserId },
          }),
      },
    },
  });
  return { records, replies };
}

describe('the reply in the thread (spec 016, E)', () => {
  it('AC-41: posts in the session’s first thread, and the session keeps where it went', async () => {
    const posted: { channel: string; thread_ts: string; text: string }[] = [];
    outside.use(slackPosts(posted));
    const { records, replies } = await setUp({
      context: [{ kind: 'jira', key: 'PROJ-1' }, slackThread, discordThread],
    });

    const answer = await replies.post(id, 'A fix is up for review');

    expect(answer).toEqual({
      result: 'posted',
      url: 'https://acme.slack.com/archives/C024BE91L/p1793620000000100?thread_ts=1793613600.000100&cid=C024BE91L',
    });
    expect(posted).toEqual([{ channel: 'C024BE91L', thread_ts: '1793613600.000100', text: 'A fix is up for review' }]);
    expect((await records.get(id))?.session.threadReply).toEqual({
      state: 'posted',
      url: 'https://acme.slack.com/archives/C024BE91L/p1793620000000100?thread_ts=1793613600.000100&cid=C024BE91L',
      channel: 'web-platform',
    });
  });

  it('AC-41: posts in a Discord thread as the bot', async () => {
    outside.use(discordPosts());
    const { replies } = await setUp({ context: [discordThread] });

    expect(await replies.post(id, 'A fix is up')).toEqual({
      result: 'posted',
      url: 'https://discord.com/channels/1100000000000000001/1100000000000000002/1434480000000000001',
    });
  });

  it('AC-42: a refused post keeps nothing, and answers in the tool’s words', async () => {
    outside.use(slackPosts([], 'is_archived'));
    const { records, replies } = await setUp({});

    expect(await replies.post(id, 'A fix is up')).toEqual({ result: 'failed', reason: 'is_archived' });
    expect((await records.get(id))?.session.threadReply).toBeNull();
  });

  it('AC-43: Not now keeps the reply put off; a posted one stays posted', async () => {
    const { records, replies } = await setUp({});
    expect(await replies.dismiss(id)).toBe(true);
    expect((await records.get(id))?.session.threadReply).toEqual({ state: 'dismissed' });
    expect(await replies.dismiss('0000000000000009')).toBe(false);
  });

  it('AC-44: nothing is posted without a thread, before the pull request, twice, or with the tool disconnected', async () => {
    expect(await (await setUp({ context: [] })).replies.post(id, 'hi')).toEqual({ cannot: 'no_thread' });
    expect(await (await setUp({ pullRequest: null })).replies.post(id, 'hi')).toEqual({ cannot: 'no_pull_request' });
    const posted = { state: 'posted', url: 'https://acme.slack.com/archives/C1/p1', channel: null } as const;
    expect(await (await setUp({ threadReply: posted })).replies.post(id, 'hi')).toEqual({ cannot: 'posted' });
    expect(await (await setUp({}, { connected: false })).replies.post(id, 'hi')).toEqual({
      result: 'failed',
      reason: "Slack isn't connected. Connect it in Settings.",
    });
    expect(await (await setUp({})).replies.post('0000000000000009', 'hi')).toBeNull();
  });
});
