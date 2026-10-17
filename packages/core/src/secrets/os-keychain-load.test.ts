import { expect, it, vi } from 'vitest';
import { createEventBus } from '../events/event-bus.ts';
import { createOsKeychain } from './os-keychain.ts';
import { createTokenStore } from './token-store.ts';

// A machine where the native library can't load, such as Linux without D-Bus.
vi.mock('@napi-rs/keyring', () => {
  throw new Error('dlopen failed: libdbus-1.so.3 not found');
});

it('AC-6: loads nothing until a token is needed, then reports keychain_unavailable', async () => {
  // Importing and creating the keychain must not load the library, or DevHub could not start here.
  const store = createTokenStore({ keychain: createOsKeychain(), events: createEventBus() });

  await expect(store.read('github')).rejects.toMatchObject({ code: 'keychain_unavailable' });
  await expect(store.save('github', 'github-token-for-tests')).rejects.toMatchObject({
    code: 'keychain_unavailable',
  });
});
