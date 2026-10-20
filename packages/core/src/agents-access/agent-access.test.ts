import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../secrets/memory-keychain.ts';
import { createAgentAccess } from './agent-access.ts';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'orynx-agents-'));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function setUp(keychain = createMemoryKeychain(), electron = false) {
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const access = createAgentAccess({
    keychain,
    events,
    devhubHome: home,
    program: { path: '/usr/local/bin/node', electron },
  });
  return { access, keychain, heard };
}

const bridges = async () => readdir(join(home, 'mcp')).catch(() => [] as string[]);

describe('agents’ access to Orynx tickets (spec 037)', () => {
  it('AC-39: is off until you turn it on, and takes no token and gives no config while off', async () => {
    const { access } = setUp();
    expect(await access.enabled()).toBe(false);
    expect(await access.token()).toBeNull();
    expect(await access.accepts('anything')).toBe(false);
    expect(await access.accepts(undefined)).toBe(false);
    expect(await access.config()).toBeNull();
    expect(await bridges()).toEqual([]);
  });

  it('AC-40: on keeps a new token in the keychain, under agents, and takes it alone', async () => {
    const { access, keychain, heard } = setUp();

    await access.set(true);

    const token = await keychain.get('agents');
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(await access.enabled()).toBe(true);
    expect(await access.token()).toBe(token);
    expect(await access.accepts(token ?? '')).toBe(true);
    expect(await access.accepts(`${token ?? ''}x`)).toBe(false);
    expect(await access.accepts('')).toBe(false);
    expect(heard).toEqual([{ type: 'settings.changed' }]);
  });

  it('AC-40: the config runs a bridge holding the token, readable by you alone, and holds no token itself', async () => {
    const { access } = setUp();
    await access.set(true);
    const token = (await access.token()) ?? '';

    const config = JSON.parse((await access.config()) ?? '') as {
      mcpServers: { orynx: { command: string; args: string[] } };
    };

    const [bridge] = config.mcpServers.orynx.args;
    expect(config).toEqual({ mcpServers: { orynx: { command: '/usr/local/bin/node', args: [bridge] } } });
    expect(bridge).toMatch(new RegExp(`^${join(home, 'mcp')}/orynx-mcp-[0-9a-f]{16}\\.mjs$`));
    expect(JSON.stringify(config)).not.toContain(token);
    expect(await readFile(bridge ?? '', 'utf8')).toContain(JSON.stringify(token));
    expect((await stat(bridge ?? '')).mode & 0o777).toBe(0o600);
    expect((await stat(join(home, 'mcp'))).mode & 0o777).toBe(0o700);
    // A second Copy writes the same bridge again.
    await access.config();
    expect(await bridges()).toHaveLength(1);
  });

  it('AC-43: in the desktop app, the config runs the bridge on its own program as Node', async () => {
    const { access } = setUp(createMemoryKeychain(), true);
    await access.set(true);
    const config = JSON.parse((await access.config()) ?? '') as { mcpServers: { orynx: { env?: object } } };
    expect(config.mcpServers.orynx.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
  });

  it('AC-42: off deletes the token and every bridge; on again makes another, so an old config stays dead', async () => {
    const { access, keychain } = setUp();
    await access.set(true);
    const first = await access.token();
    await access.config();

    await access.set(false);
    expect(await keychain.get('agents')).toBeNull();
    expect(await access.accepts(first ?? '')).toBe(false);
    expect(await bridges()).toEqual([]);

    await access.set(true);
    expect(await access.token()).not.toBe(first);
    expect(await access.accepts(first ?? '')).toBe(false);
  });

  it('turning it on again while it’s on keeps the token, so a bridge running with it carries on', async () => {
    const { access } = setUp();
    await access.set(true);
    const token = await access.token();

    await access.set(true);

    expect(await access.token()).toBe(token);
  });

  it('reads a token kept in the keychain from before, as on a restart', async () => {
    const { access } = setUp(createMemoryKeychain({ agents: 'kept-token' }));
    expect(await access.enabled()).toBe(true);
    expect(await access.accepts('kept-token')).toBe(true);
  });

  it('lets nobody in when the keychain can’t be read', async () => {
    const { access } = setUp(createUnreachableKeychain());
    expect(await access.accepts('anything')).toBe(false);
    await expect(access.enabled()).rejects.toThrow();
  });
});
