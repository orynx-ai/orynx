import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, readEnvFile } from './config.ts';

// Made-up values that match no real token format, so the secrets gate stays quiet.
const jiraToken = 'jira-token-for-tests-1234';
const githubToken = 'github-token-for-tests-5678';

describe('loadConfig', () => {
  it('uses the spec defaults when nothing is set', () => {
    expect(loadConfig({ env: {} })).toEqual({
      port: 4317,
      home: join(homedir(), '.devhub'),
      logLevel: 'info',
      pretty: true,
      tokens: { fromEnv: false, env: {}, ignored: [] },
    });
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      env: { DEVHUB_PORT: '5999', DEVHUB_HOME: '/tmp/devhub-test', LOG_LEVEL: 'warn', NODE_ENV: 'production' },
    });
    expect(config).toMatchObject({ port: 5999, home: '/tmp/devhub-test', logLevel: 'warn', pretty: false });
  });

  it('treats an empty DEVHUB_HOME as the default, like the blank line in .env.example', () => {
    expect(loadConfig({ env: { DEVHUB_HOME: '' } }).home).toBe(join(homedir(), '.devhub'));
  });

  it('explains which setting is wrong', () => {
    expect(() => loadConfig({ env: { DEVHUB_PORT: 'nope' } })).toThrow(/DEVHUB_PORT/);
  });

  it('AC-12: reads settings from the .env file, and a variable set in the shell wins', () => {
    const envFile = '# my settings\nDEVHUB_PORT=4320\nLOG_LEVEL=debug\n';

    expect(loadConfig({ env: {}, envFile })).toMatchObject({ port: 4320, logLevel: 'debug' });
    expect(loadConfig({ env: { DEVHUB_PORT: '4321' }, envFile })).toMatchObject({ port: 4321, logLevel: 'debug' });
  });

  it('AC-13: stops on a switch that is not true or false, and names it', () => {
    expect(() => loadConfig({ env: {}, envFile: 'DEVHUB_TOKENS_FROM_ENV=maybe\n' })).toThrow(
      /DevHub settings are not valid[\s\S]*DEVHUB_TOKENS_FROM_ENV/,
    );
  });

  it('AC-7: with the switch off, hands core no tokens and lists the ones it ignores', () => {
    const config = loadConfig({ env: { DEVHUB_GITHUB_TOKEN: githubToken, DEVHUB_JIRA_API_TOKEN: '' } });

    expect(config.tokens).toEqual({ fromEnv: false, env: {}, ignored: ['DEVHUB_GITHUB_TOKEN'] });
  });

  it('AC-8: with the switch on, hands core the .env tokens by tool', () => {
    const envFile = `DEVHUB_TOKENS_FROM_ENV=true\nDEVHUB_JIRA_API_TOKEN=${jiraToken}\nDEVHUB_SLACK_USER_TOKEN=\n`;

    const config = loadConfig({ env: { DEVHUB_GITHUB_TOKEN: githubToken }, envFile });

    expect(config.tokens).toEqual({ fromEnv: true, env: { jira: jiraToken, github: githubToken }, ignored: [] });
  });
});

describe('readEnvFile', () => {
  const folder = mkdtempSync(join(tmpdir(), 'devhub-env-'));

  it('returns nothing when there is no .env file', () => {
    expect(readEnvFile(join(folder, 'missing.env'))).toBeUndefined();
  });

  it('reads the file and says whether other users on this computer can read it', () => {
    const path = join(folder, '.env');
    writeFileSync(path, 'DEVHUB_PORT=4320\n');

    chmodSync(path, 0o600);
    expect(readEnvFile(path)).toEqual({ text: 'DEVHUB_PORT=4320\n', othersCanRead: false });

    chmodSync(path, 0o644);
    expect(readEnvFile(path)).toEqual({ text: 'DEVHUB_PORT=4320\n', othersCanRead: true });
  });

  it('stops when .env is there but cannot be read, rather than starting without it', () => {
    expect(() => readEnvFile(folder)).toThrow(/EISDIR/);
  });
});
