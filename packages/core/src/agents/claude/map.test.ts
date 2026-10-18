import { describe, expect, it } from 'vitest';
import { authStatus } from '../../test/fake-claude.ts';
import { readAuthStatus } from './map.ts';

const read = (fields: Record<string, unknown>, exitCode = 0) => readAuthStatus(authStatus(fields), exitCode);

describe('readAuthStatus', () => {
  it('AC-2: reads a claude.ai login with its email and organisation', () => {
    expect(read({ email: 'you@company.com', orgName: 'Company' })).toEqual({
      state: 'signed_in',
      method: 'claude_ai',
      email: 'you@company.com',
      organisation: 'Company',
    });
  });

  it('AC-2: a claude.ai login with no organisation, or an empty one, has none', () => {
    expect(read({ orgName: null })).toMatchObject({ method: 'claude_ai', organisation: null });
    expect(read({ orgName: '' })).toMatchObject({ method: 'claude_ai', organisation: null });
    expect(read({ email: undefined, orgName: undefined })).toMatchObject({ email: null, organisation: null });
  });

  it.each([
    [{ authMethod: 'api_key', apiProvider: 'firstParty' }, 'api_key'],
    [{ authMethod: 'api_key_helper', apiProvider: 'firstParty' }, 'api_key'],
    [{ authMethod: 'third_party', apiProvider: 'bedrock' }, 'bedrock'],
    [{ authMethod: 'third_party', apiProvider: 'vertex' }, 'vertex'],
    [{ authMethod: 'third_party', apiProvider: 'foundry' }, 'other'],
    [{ authMethod: 'oauth_token', apiProvider: 'firstParty' }, 'other'],
    [{ authMethod: 'none', apiProvider: 'gateway' }, 'other'],
    [{ authMethod: 'something_new', apiProvider: 'firstParty' }, 'other'],
  ])('AC-3: names the way Claude Code signs in, %o, without the account', (fields, method) => {
    // An API key from a Console login also carries an email; the card names only the way (Q5b).
    expect(read({ ...fields, email: 'you@company.com', orgName: 'Company' })).toEqual({
      state: 'signed_in',
      method,
      email: null,
      organisation: null,
    });
  });

  it('AC-4: reads signed out from the JSON and exit 1', () => {
    expect(read({ loggedIn: false, authMethod: 'none' }, 1)).toEqual({ state: 'signed_out' });
  });

  it('AC-4: reads signed out from loggedIn alone, should a build leave the other fields out', () => {
    expect(readAuthStatus('{"loggedIn":false}', 1)).toEqual({ state: 'signed_out' });
  });

  it('AC-6: a signed-in answer without its way of signing in is not read', () => {
    expect(readAuthStatus('{"loggedIn":true,"apiProvider":"firstParty"}', 0)).toBeNull();
    expect(readAuthStatus('{"loggedIn":true,"authMethod":"claude.ai"}', 0)).toBeNull();
  });

  it('AC-6: an answer whose exit code disagrees with it is not read', () => {
    expect(read({ loggedIn: true }, 1)).toBeNull();
    expect(read({ loggedIn: false }, 0)).toBeNull();
  });

  it.each([
    ['nothing', ''],
    ['text', 'Not logged in. Run claude auth login to authenticate.\n'],
    ['JSON without loggedIn', '{"authMethod":"claude.ai"}'],
    ['loggedIn that is not true or false', '{"loggedIn":"yes","authMethod":"claude.ai","apiProvider":"firstParty"}'],
    ['a list', '[true]'],
  ])('AC-6: %s is not read as a login', (_what, stdout) => {
    expect(readAuthStatus(stdout, 0)).toBeNull();
  });
});
