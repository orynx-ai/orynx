import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('uses ~/.devhub and GitHub Releases when nothing is set', () => {
    expect(loadConfig({ env: { PATH: '/usr/bin:/bin' } })).toEqual({
      home: join(homedir(), '.devhub'),
      updatesUrl: null,
      path: '/usr/bin:/bin',
      env: { PATH: '/usr/bin:/bin' },
    });
  });

  it('AC-40: passes the whole environment on to the hub, so a test can give it its own home and keychain', () => {
    const env = {
      PATH: '/usr/bin',
      DEVHUB_HOME: '/tmp/devhub-desktop-test',
      DEVHUB_KEYCHAIN: 'memory',
      DEVHUB_UPDATES_URL: 'http://127.0.0.1:4555/releases',
    };

    expect(loadConfig({ env })).toEqual({
      home: '/tmp/devhub-desktop-test',
      updatesUrl: 'http://127.0.0.1:4555/releases',
      path: '/usr/bin',
      env,
    });
  });

  it('treats empty settings as not set, like the blank lines in .env.example', () => {
    expect(loadConfig({ env: { DEVHUB_HOME: '', DEVHUB_UPDATES_URL: '' } })).toMatchObject({
      home: join(homedir(), '.devhub'),
      updatesUrl: null,
      path: '',
    });
  });

  it('explains which setting is wrong', () => {
    expect(() => loadConfig({ env: { DEVHUB_UPDATES_URL: 'not a url' } })).toThrow(/DEVHUB_UPDATES_URL/);
  });
});
