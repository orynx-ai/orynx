import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../secrets/memory-keychain.ts';
import { createAgentAccess } from './agent-access.ts';

function setUp(keychain = createMemoryKeychain()) {
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  let shut = 0;
  const access = createAgentAccess({
    keychain,
    events,
    onShut: () => {
      shut += 1;
      return Promise.resolve();
    },
  });
  return { access, keychain, heard, shut: () => shut };
}

describe('agents’ access to Orynx tickets (spec 037)', () => {
  it('AC-39: is off until you turn it on, and takes no token while off', async () => {
    const { access } = setUp();
    expect(await access.enabled()).toBe(false);
    expect(await access.token()).toBeNull();
    expect(await access.accepts('anything')).toBe(false);
    expect(await access.accepts(undefined)).toBe(false);
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

  it('AC-42: off deletes the token and the bridges; on again makes another, so an old config stays dead', async () => {
    const { access, keychain, shut } = setUp();
    await access.set(true);
    const first = await access.token();

    await access.set(false);
    expect(await keychain.get('agents')).toBeNull();
    expect(await access.accepts(first ?? '')).toBe(false);
    expect(shut()).toBe(1);

    await access.set(true);
    expect(await access.token()).not.toBe(first);
    expect(await access.accepts(first ?? '')).toBe(false);
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
