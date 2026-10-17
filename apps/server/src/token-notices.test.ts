import { describe, expect, it } from 'vitest';
import { tokenNotices } from './token-notices.ts';

const switchOn = 'Tokens: OS keychain first, then .env (DEVHUB_TOKENS_FROM_ENV is on).';
const chmod = '.env holds tokens and other users on this computer can read it. Run: chmod 600 .env';

describe('tokenNotices', () => {
  it('says nothing when tokens live only in the keychain', () => {
    expect(tokenNotices({ fromEnv: false, ignored: [] }, undefined)).toEqual([]);
  });

  it('AC-7: names each token setting that is set but not used, once', () => {
    expect(
      tokenNotices({ fromEnv: false, ignored: ['DEVHUB_GITHUB_TOKEN', 'DEVHUB_SLACK_USER_TOKEN'] }, undefined),
    ).toEqual([
      {
        level: 'warn',
        message: 'DEVHUB_GITHUB_TOKEN is set but not used. To use tokens from .env, set DEVHUB_TOKENS_FROM_ENV=true.',
      },
      {
        level: 'warn',
        message:
          'DEVHUB_SLACK_USER_TOKEN is set but not used. To use tokens from .env, set DEVHUB_TOKENS_FROM_ENV=true.',
      },
    ]);
  });

  it('AC-11: says once that the switch is on', () => {
    expect(tokenNotices({ fromEnv: true, ignored: [] }, { text: '', othersCanRead: false, holdsTokens: true })).toEqual(
      [{ level: 'info', message: switchOn }],
    );
  });

  it('AC-11: asks for chmod 600 when .env holds a token and other users can read it', () => {
    expect(tokenNotices({ fromEnv: true, ignored: [] }, { text: '', othersCanRead: true, holdsTokens: true })).toEqual([
      { level: 'info', message: switchOn },
      { level: 'warn', message: chmod },
    ]);
  });

  it('asks for chmod 600 even with the switch off, since the file still holds a token', () => {
    const readable = { text: '', othersCanRead: true, holdsTokens: true };

    expect(tokenNotices({ fromEnv: false, ignored: [] }, readable)).toEqual([{ level: 'warn', message: chmod }]);
  });

  it('AC-11: does not ask for chmod when the readable .env holds no token', () => {
    const settingsOnly = { text: '', othersCanRead: true, holdsTokens: false };

    expect(tokenNotices({ fromEnv: true, ignored: [] }, settingsOnly)).toEqual([{ level: 'info', message: switchOn }]);
  });
});
