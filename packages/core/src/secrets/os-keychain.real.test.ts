import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createEventBus } from '../events/event-bus.ts';
import { createOsKeychain } from './os-keychain.ts';
import { createTokenStore } from './token-store.ts';

// Runs only through `pnpm test:keychain`, never in `pnpm test`, `pnpm verify` or CI (spec 002, Q5).
// It uses its own service name, so DevHub's real "DevHub" items are never read or changed.
const service = 'DevHub test';

it('AC-1, AC-2, AC-3: saves, reads and deletes one item in the real OS keychain', async () => {
  const keychain = createOsKeychain(service);
  const store = createTokenStore({ keychain, events: createEventBus() });
  const token = `devhub-keychain-check-${randomUUID()}`;

  try {
    await store.save('jira', token);
    expect(await store.read('jira')).toEqual({ token, source: 'keychain' });
  } finally {
    await store.remove('jira');
  }

  expect(await store.read('jira')).toBeNull();
  await expect(store.remove('jira')).resolves.toBeUndefined();
});
