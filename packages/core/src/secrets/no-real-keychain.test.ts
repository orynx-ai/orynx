import { expect, it } from 'vitest';
import { createOsKeychain } from './os-keychain.ts';

it('a unit test cannot reach the real OS keychain, even by mistake', async () => {
  await expect(createOsKeychain().get('jira')).rejects.toThrow('Unit tests must not use the real OS keychain');
});
