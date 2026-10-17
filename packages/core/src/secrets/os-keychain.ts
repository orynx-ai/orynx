import type { AsyncEntry } from '@napi-rs/keyring';
import type { IntegrationId } from '@devhub/contracts';
import type { Keychain } from './keychain.ts';

/** The service DevHub's keychain items are saved under. Keychain Access lists them as "DevHub". */
export const keychainService = 'DevHub';

interface Keyring {
  AsyncEntry: typeof AsyncEntry;
}

/**
 * The OS keychain (macOS Keychain, Windows Credential Manager, the Secret Service on Linux) through
 * @napi-rs/keyring. The native library loads on first use, not when DevHub starts: starting never
 * touches the keychain, and a machine where the library can't load gets `keychain_unavailable`
 * from the token store instead of a server that won't start.
 */
export function createOsKeychain(service: string = keychainService): Keychain {
  let keyring: Promise<Keyring> | undefined;
  async function entry(account: IntegrationId) {
    keyring ??= import('@napi-rs/keyring');
    const { AsyncEntry } = await keyring;
    return new AsyncEntry(service, account);
  }

  return {
    async get(account) {
      return (await (await entry(account)).getPassword()) ?? null;
    },
    async set(account, token) {
      await (await entry(account)).setPassword(token);
    },
    async delete(account) {
      // Resolves false when there was nothing to delete, which is not an error.
      await (await entry(account)).deletePassword();
    },
  };
}
