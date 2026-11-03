import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import { createMemoryKeychain } from '../../secrets/memory-keychain.ts';
import { createTokenStore, type EnvTokens } from '../../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../../settings/settings-store.ts';
import { acceptingBot, discordToken, discordUserId, useFakeDiscord } from '../../test/fake-discord.ts';
import { ConnectionError } from '../connection-error.ts';
import { createDiscordClient } from './client.ts';
import { createDiscordConnection } from './connection.ts';

const discord = useFakeDiscord();
const saved = { bot: 'Orynx', userId: discordUserId };

function setup({ envTokens, settings: initial = {} }: { envTokens?: EnvTokens; settings?: Settings } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const keychain = createMemoryKeychain();
  const settings = createMemorySettingsStore(initial);
  const connection = createDiscordConnection({
    settings,
    tokens: createTokenStore({ keychain, events, ...(envTokens === undefined ? {} : { envTokens }) }),
    discord: createDiscordClient({ timeoutMs: 500 }),
    events,
    envToken: envTokens?.discord !== undefined,
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

describe('Discord connection (spec 016)', () => {
  it('AC-5: reads as not connected', async () => {
    const { connection } = setup();
    expect(await connection.read()).toEqual({ saved: null, envToken: false });
    expect(await connection.status()).toEqual({ state: 'not_connected', detail: null });
  });

  it('AC-6: keeps the bot token in the keychain, the bot and you in settings, and names its servers', async () => {
    const { connection, keychain, settings, seen } = setup();

    expect(await connection.connect({ token: discordToken })).toEqual({ saved, envToken: false });
    expect(await keychain.get('discord')).toBe(discordToken);
    expect((await settings.read()).discord).toEqual(saved);
    expect(seen.at(-1)).toEqual({ type: 'status.changed' });
    expect(await connection.status()).toMatchObject({
      state: 'connected',
      detail: 'Orynx · 2 servers',
      account: 'Orynx',
    });
  });

  it('AC-6: says when the bot is in one server, or none yet', async () => {
    discord.use(...acceptingBot({ servers: [{ id: '1100000000000000001', name: 'Acme' }] }));
    const one = setup();
    await one.connection.connect({ token: discordToken });
    expect((await one.connection.status()).detail).toBe('Orynx · 1 server');

    discord.use(...acceptingBot({ servers: [] }));
    const none = setup();
    await none.connection.connect({ token: discordToken });
    expect((await none.connection.status()).detail).toBe('Orynx · in no servers yet');
  });

  it('AC-7: saves nothing with Message Content off, and says to turn it on', async () => {
    discord.use(...acceptingBot({ flags: 0 }));
    const { connection, keychain } = setup();

    expect(await failure(connection.connect({ token: discordToken }))).toMatchObject({
      code: 'integration_rejected',
      message: 'Turn on Message Content Intent for your bot, then connect again.',
    });
    expect(await keychain.get('discord')).toBeNull();
  });

  it('AC-8: a team’s bot answers user_id_needed, then connects with your user ID', async () => {
    discord.use(...acceptingBot({ team: true }));
    const { connection, settings } = setup();

    expect((await failure(connection.connect({ token: discordToken }))).code).toBe('user_id_needed');
    await connection.connect({ token: discordToken, userId: '80351110224678913' });
    expect((await settings.read()).discord).toEqual({ bot: 'Orynx', userId: '80351110224678913' });
    // The status line's check names you, so a team's bot keeps reading as connected.
    expect((await connection.status()).state).toBe('connected');
  });

  it('refuses a wrong token, and asks for one when none is typed, saved or in .env', async () => {
    expect((await failure(setup().connection.connect({ token: 'fake-wrong-token' }))).code).toBe(
      'integration_rejected',
    );
    expect(await failure(setup().connection.connect({}))).toMatchObject({
      code: 'bad_request',
      message: "Paste your bot's token.",
    });
  });

  it('AC-9: Disconnect removes the token and the saved connection', async () => {
    const { connection, keychain, settings } = setup();
    await connection.connect({ token: discordToken });

    await connection.disconnect();

    expect(await keychain.get('discord')).toBeNull();
    expect((await settings.read()).discord).toBeUndefined();
    expect((await connection.status()).state).toBe('not_connected');
  });

  it('the sync gets the token and the saved connection, or a refused problem without a token', async () => {
    const { connection, keychain } = setup({ settings: { discord: saved } });
    expect(await connection.credentials()).toEqual({
      ok: false,
      connection: `discord ${discordUserId}`,
      problem: { kind: 'rejected' },
    });
    await keychain.set('discord', discordToken);
    expect(await connection.credentials()).toEqual({
      ok: true,
      connection: `discord ${discordUserId}`,
      token: discordToken,
      saved,
    });
  });
});
