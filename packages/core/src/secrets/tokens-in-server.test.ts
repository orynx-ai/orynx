import { Writable } from 'node:stream';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, tokenHeader, type ServerEvent } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import type { Keychain } from './keychain.ts';
import { createMemoryKeychain, createUnreachableKeychain } from './memory-keychain.ts';

const sessionToken = 'tokens-session-token-0123456789';
const port = 4317;
const jiraToken = 'jira-token-for-tests-1234';
const githubToken = 'github-token-for-tests-5678';
const envToken = 'slack-token-from-dotenv-9012';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/** The real hub, logging every line at trace into `log`, with every event it publishes in `events`. */
async function startHub(keychain?: Keychain) {
  const log: string[] = [];
  const bus = createEventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((event) => events.push(event));
  const app = await createServer({
    token: sessionToken,
    port,
    version: 'test',
    events: bus,
    userName: () => Promise.resolve(null),
    envTokens: { slack: envToken },
    logger: {
      level: 'trace',
      stream: new Writable({
        write(chunk: Buffer, _encoding, done) {
          log.push(chunk.toString());
          done();
        },
      }),
    },
    ...(keychain === undefined ? {} : { keychain }),
  });
  apps.push(app);
  const status = () =>
    app.inject({
      method: 'GET',
      url: apiRoutes.status,
      headers: { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken },
    });
  return { app, log, events, status };
}

/** A keychain that counts how often it is used. */
function countingKeychain() {
  const inner = createMemoryKeychain();
  const calls = { count: 0 };
  const keychain: Keychain = {
    get: (account) => (calls.count++, inner.get(account)),
    set: (account, token) => (calls.count++, inner.set(account, token)),
    delete: (account) => (calls.count++, inner.delete(account)),
  };
  return { keychain, calls };
}

describe('tokens in the hub', () => {
  it('AC-1: saves through the hub into the keychain the host passed', async () => {
    const keychain = createMemoryKeychain();
    const { app } = await startHub(keychain);

    await app.tokens.save('jira', jiraToken);

    expect(await keychain.get('jira')).toBe(jiraToken);
    expect(await app.tokens.read('jira')).toEqual({ token: jiraToken, source: 'keychain' });
    expect(await app.tokens.read('slack')).toEqual({ token: envToken, source: 'env' });
  });

  it('uses an empty in-memory keychain when the host passes none', async () => {
    const { app } = await startHub();

    expect(await app.tokens.read('jira')).toBeNull();
    await app.tokens.save('jira', jiraToken);
    expect(await app.tokens.read('jira')).toEqual({ token: jiraToken, source: 'keychain' });
  });

  it('never touches the keychain to start or to serve the status', async () => {
    const { keychain, calls } = countingKeychain();
    const { status } = await startHub(keychain);

    expect((await status()).statusCode).toBe(200);
    expect(calls.count).toBe(0);
  });

  it('AC-6: still serves the status when the keychain cannot be reached', async () => {
    const { app, status } = await startHub(createUnreachableKeychain());

    await expect(app.tokens.read('jira')).rejects.toMatchObject({ code: 'keychain_unavailable' });
    expect((await status()).statusCode).toBe(200);
  });

  it('AC-14: no token reaches a log line, a response or an event, even at trace', async () => {
    const working = await startHub(createMemoryKeychain({ jira: jiraToken }));
    await working.app.tokens.read('jira');
    await working.app.tokens.read('slack');
    await working.app.tokens.save('github', githubToken);
    await working.app.tokens.remove('github');
    const workingStatus = await working.status();

    const failing = await startHub(createUnreachableKeychain((token) => `could not store ${token ?? 'nothing'}`));
    const failures = await Promise.all(
      [failing.app.tokens.save('github', githubToken), failing.app.tokens.read('jira')].map((attempt) =>
        attempt.then(
          () => 'no error',
          (caught: unknown) => inspect(caught, { depth: Infinity, showHidden: true }),
        ),
      ),
    );
    const failingStatus = await failing.status();

    const everything = [
      ...working.log,
      ...failing.log,
      workingStatus.body,
      failingStatus.body,
      JSON.stringify([...working.events, ...failing.events]),
      ...failures,
    ].join('\n');
    expect(working.log.length).toBeGreaterThan(0);
    for (const token of [jiraToken, githubToken, envToken]) expect(everything).not.toContain(token);
  });
});
