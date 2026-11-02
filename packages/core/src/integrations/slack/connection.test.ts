import { describe, expect, it } from 'vitest';
import { slackScopes, type ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Keychain } from '../../secrets/keychain.ts';
import { createMemoryKeychain } from '../../secrets/memory-keychain.ts';
import { createTokenStore, type EnvTokens } from '../../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../../settings/settings-store.ts';
import { acceptingAuthTest, slackToken, slackUserId, useFakeSlack } from '../../test/fake-slack.ts';
import { ConnectionError } from '../connection-error.ts';
import { createSlackClient } from './client.ts';
import { createSlackConnection } from './connection.ts';

const slack = useFakeSlack();
const saved = { workspace: 'Acme', url: 'https://acme.slack.com/', userId: slackUserId, name: 'Neha K.' };

function setup({
  keychain = createMemoryKeychain(),
  envTokens,
  settings: initial = {},
}: { keychain?: Keychain; envTokens?: EnvTokens; settings?: Settings } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const settings = createMemorySettingsStore(initial);
  const connection = createSlackConnection({
    settings,
    tokens: createTokenStore({ keychain, events, ...(envTokens === undefined ? {} : { envTokens }) }),
    slack: createSlackClient({ timeoutMs: 500 }),
    events,
    envToken: envTokens?.slack !== undefined,
  });
  return { connection, keychain, settings, seen };
}

async function failure(work: Promise<unknown>): Promise<ConnectionError> {
  const error: unknown = await work.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof ConnectionError)) throw new Error('Expected a ConnectionError.');
  return error;
}

describe('Slack connection (spec 016)', () => {
  it('AC-1: reads as not connected, without touching the keychain', async () => {
    const { connection } = setup({ keychain: { get: () => Promise.reject(new Error('no')) } as unknown as Keychain });
    expect(await connection.read()).toEqual({ saved: null, envToken: false });
    expect(await connection.status()).toEqual({ state: 'not_connected', detail: null });
  });

  it('AC-2: checks the token with Slack, keeps it in the keychain and who it belongs to in settings', async () => {
    const { connection, keychain, settings, seen } = setup();

    expect(await connection.connect({ token: slackToken })).toEqual({ saved, envToken: false });
    expect(await keychain.get('slack')).toBe(slackToken);
    expect((await settings.read()).slack).toEqual(saved);
    expect(seen).toContainEqual({ type: 'status.changed' });
    expect(await connection.status()).toMatchObject({
      state: 'connected',
      detail: 'Neha K. in Acme',
      account: 'Neha K.',
    });
  });

  it('AC-3: saves nothing when the token misses scopes, and names them', async () => {
    slack.use(acceptingAuthTest({ scopes: slackScopes.filter((scope) => scope !== 'chat:write') }));
    const { connection, keychain, settings } = setup();

    const error = await failure(connection.connect({ token: slackToken }));
    expect(error.code).toBe('integration_rejected');
    expect(error.message).toBe(
      "Slack's app is missing chat:write. Ask your admin to add them, then reinstall the app.",
    );
    expect(await keychain.get('slack')).toBeNull();
    expect((await settings.read()).slack).toBeUndefined();
  });

  it('AC-4: saves nothing when Slack refuses the token', async () => {
    const { connection, keychain } = setup();

    const error = await failure(connection.connect({ token: 'fake-wrong-token' }));
    expect(error).toMatchObject({
      code: 'integration_rejected',
      message: "Slack didn't accept this token. Check it, or copy it again.",
    });
    expect(await keychain.get('slack')).toBeNull();
  });

  it('refuses before asking Slack when no token is typed, saved or in .env', async () => {
    const error = await failure(setup().connection.connect({}));
    expect(error).toMatchObject({ code: 'bad_request', message: 'Paste your Slack token.' });
  });

  it('an empty token uses the .env one and saves only who it belongs to', async () => {
    const { connection, keychain } = setup({ envTokens: { slack: slackToken } });

    expect(await connection.connect({})).toEqual({ saved, envToken: true });
    expect(await keychain.get('slack')).toBeNull();
    expect((await connection.status()).detail).toBe('Neha K. in Acme, token from .env');
  });

  it('AC-9: Disconnect removes the token and the saved connection, and says so', async () => {
    const { connection, keychain, settings, seen } = setup();
    await connection.connect({ token: slackToken });
    seen.length = 0;

    await connection.disconnect();

    expect(await keychain.get('slack')).toBeNull();
    expect((await settings.read()).slack).toBeUndefined();
    expect(await connection.status()).toEqual({ state: 'not_connected', detail: null });
    expect(seen.at(-1)).toEqual({ type: 'status.changed' });
  });

  it('a revoked token reads as an error on the status line, and the sync gets a refused problem', async () => {
    const { connection, keychain } = setup({ settings: { slack: saved } });
    await keychain.set('slack', 'fake-revoked-token');

    expect(await connection.status()).toMatchObject({
      state: 'error',
      detail: "Slack didn't accept this token. Check it, or copy it again.",
    });
    expect(await connection.credentials()).toEqual({
      ok: true,
      connection: `${saved.url} ${saved.userId}`,
      token: 'fake-revoked-token',
      saved,
    });

    await keychain.delete('slack');
    expect(await connection.credentials()).toEqual({
      ok: false,
      connection: `${saved.url} ${saved.userId}`,
      problem: { kind: 'rejected' },
    });
  });

  it('Test connection asks Slack now and says how long it took', async () => {
    const { connection } = setup();
    await connection.connect({ token: slackToken });

    const check = await connection.checkNow();
    expect(check.status.state).toBe('connected');
    expect(check.ms).toBeGreaterThanOrEqual(0);
    expect((await failure(setup().connection.checkNow())).code).toBe('bad_request');
  });
});
