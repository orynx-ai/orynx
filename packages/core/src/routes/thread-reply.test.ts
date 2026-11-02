import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ApiErrorSchema, apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySessionStore, StoredSessionSchema } from '../sessions/session-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { slackPosts, slackToken, slackUserId, useFakeSlack } from '../test/fake-slack.ts';

const slack = useFakeSlack();
const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const id = '0000000000000001';
const url = (path: string) => path.replace(':id', id);

let app: FastifyInstance | undefined;

async function server(pullRequest: boolean) {
  const sessions = createMemorySessionStore();
  await sessions.create(
    StoredSessionSchema.parse({
      session: makeSession({
        id,
        state: 'pr_open',
        context: [{ kind: 'slack_thread', channel: 'C024BE91L', ts: '1793613600.000100' }],
        pullRequest: pullRequest
          ? {
              number: 2841,
              url: 'https://github.com/acme/web-app/pull/2841',
              repository: 'acme/web-app',
              openedAt: '2026-11-02T10:00:00.000Z',
            }
          : null,
      }),
      repository: null,
      worktree: null,
      startCommit: null,
      claudeSessionId: null,
    }),
  );
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    events: createEventBus(),
    userName: () => Promise.resolve(null),
    keychain: createMemoryKeychain({ slack: slackToken }),
    settings: createMemorySettingsStore({
      slack: { workspace: 'Acme', url: 'https://acme.slack.com/', userId: slackUserId, name: 'Rakesh D.' },
    }),
    sessions,
  });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('/api/sessions/:id/thread-reply (spec 016, E)', () => {
  it('AC-41: Post reply posts in the thread and answers its link; a second press is refused', async () => {
    const posted: { channel: string; thread_ts: string; text: string }[] = [];
    slack.use(slackPosts(posted));
    const hub = await server(true);

    const first = await hub.inject({
      method: 'POST',
      url: url(apiRoutes.sessionThreadReply),
      headers,
      payload: { text: 'A fix is up for review' },
    });
    expect(first.json()).toMatchObject({ result: 'posted' });
    expect(posted).toHaveLength(1);

    const again = await hub.inject({
      method: 'POST',
      url: url(apiRoutes.sessionThreadReply),
      headers,
      payload: { text: 'A fix is up for review' },
    });
    expect(again.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(again.json()).code).toBe('already_posted');
  });

  it('AC-44: nothing is posted before the pull request opens', async () => {
    const hub = await server(false);
    const res = await hub.inject({
      method: 'POST',
      url: url(apiRoutes.sessionThreadReply),
      headers,
      payload: { text: 'hi' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('AC-43: Not now answers 204, and 404 for no such session', async () => {
    const hub = await server(true);
    expect(
      (await hub.inject({ method: 'POST', url: url(apiRoutes.sessionThreadReplyDismiss), headers })).statusCode,
    ).toBe(204);
    const missing = apiRoutes.sessionThreadReplyDismiss.replace(':id', '0000000000000009');
    expect((await hub.inject({ method: 'POST', url: missing, headers })).statusCode).toBe(404);
  });
});
