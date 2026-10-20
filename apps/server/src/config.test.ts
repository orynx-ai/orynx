import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forgetTokenSettings, loadConfig, readEnvFile, repoEnvFile } from './config.ts';

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
      keychain: 'os',
      tokens: { fromEnv: false, env: {}, ignored: [] },
      ghSearchPath: '',
      claudeCode: null,
      sandbox: 'required',
      agentEnvironment: {},
      gitEnvironment: { GIT_TERMINAL_PROMPT: '0' },
      terminalEnvironment: { NO_COLOR: '1' },
    });
  });

  it('AC-29 (spec 036): gives your Terminal your shell’s whole environment, less Orynx’s settings and tokens', () => {
    const config = loadConfig({
      env: { HOME: '/Users/you', EDITOR: 'vim', NODE_ENV: 'production', DEVHUB_GITHUB_TOKEN: githubToken },
      envFile: 'DEVHUB_JIRA_API_TOKEN=' + jiraToken + '\n',
    });
    expect(config.terminalEnvironment).toEqual({ HOME: '/Users/you', EDITOR: 'vim', NO_COLOR: '1' });
  });

  it('012 AC-20, AC-23: checks for Claude Code’s sandbox unless DEVHUB_SANDBOX=assume, which the e2e run sets', () => {
    expect(loadConfig({ env: { DEVHUB_SANDBOX: 'assume' } }).sandbox).toBe('assume');
    expect(loadConfig({ env: {}, envFile: 'DEVHUB_SANDBOX=assume\n' }).sandbox).toBe('assume');
    expect(() => loadConfig({ env: { DEVHUB_SANDBOX: 'off' } })).toThrow(/DEVHUB_SANDBOX/);
  });

  it('AC-20 (spec 011, Q8d): gives a session’s git the short list, your SSH agent and no password prompt', () => {
    const config = loadConfig({
      env: { HOME: '/Users/you', PATH: '/usr/bin', SSH_AUTH_SOCK: '/tmp/agent.sock', DEVHUB_GITHUB_TOKEN: githubToken },
    });
    expect(config.gitEnvironment).toEqual({
      HOME: '/Users/you',
      PATH: '/usr/bin',
      SSH_AUTH_SOCK: '/tmp/agent.sock',
      GIT_TERMINAL_PROMPT: '0',
    });
  });

  it('AC-12: runs the Claude Code a shell names with DEVHUB_CLAUDE_CODE, never one written in .env (Q10)', () => {
    expect(loadConfig({ env: { DEVHUB_CLAUDE_CODE: '/tmp/fake-claude/claude' } }).claudeCode).toBe(
      '/tmp/fake-claude/claude',
    );
    expect(loadConfig({ env: {}, envFile: 'DEVHUB_CLAUDE_CODE=/tmp/elsewhere/claude\n' }).claudeCode).toBeNull();
    expect(loadConfig({ env: { DEVHUB_CLAUDE_CODE: '' } }).claudeCode).toBeNull();
  });

  it('AC-12: stops on a DEVHUB_CLAUDE_CODE that is not an absolute path, and names it', () => {
    expect(() => loadConfig({ env: { DEVHUB_CLAUDE_CODE: 'claude' } })).toThrow(/DEVHUB_CLAUDE_CODE/);
  });

  it("AC-10: gives Claude Code only the allowed part of the shell's environment, never DevHub's settings", () => {
    const config = loadConfig({
      env: { HOME: '/Users/you', PATH: '/usr/bin', DEVHUB_GITHUB_TOKEN: githubToken, DEVHUB_PORT: '4400' },
      envFile: 'ANTHROPIC_API_KEY=from-the-env-file\n',
    });
    expect(config.agentEnvironment).toEqual({ HOME: '/Users/you', PATH: '/usr/bin' });
  });

  it("AC-2: looks for gh on the shell's PATH, never on a PATH written in .env", () => {
    const config = loadConfig({ env: { PATH: '/opt/homebrew/bin:/usr/bin' }, envFile: 'PATH=/tmp/elsewhere\n' });
    expect(config.ghSearchPath).toBe('/opt/homebrew/bin:/usr/bin');
    expect(loadConfig({ env: {}, envFile: 'PATH=/tmp/elsewhere\n' }).ghSearchPath).toBe('');
  });

  it('AC-18: keeps tokens in memory with DEVHUB_KEYCHAIN=memory, so the e2e run never reads the real keychain', () => {
    expect(loadConfig({ env: { DEVHUB_KEYCHAIN: 'memory' } }).keychain).toBe('memory');
  });

  it('AC-18: stops on a keychain that is not os or memory, and names it', () => {
    expect(() => loadConfig({ env: { DEVHUB_KEYCHAIN: 'file' } })).toThrow(
      /Orynx settings are not valid[\s\S]*DEVHUB_KEYCHAIN/,
    );
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

  it('AC-7 (spec 027): DEVHUB_PORT=0 asks the OS for a free port, as the desktop app does', () => {
    expect(loadConfig({ env: { DEVHUB_PORT: '0' } }).port).toBe(0);
    expect(() => loadConfig({ env: { DEVHUB_PORT: '-1' } })).toThrow(/DEVHUB_PORT/);
  });

  it('AC-12: reads settings from the .env file, and a variable set in the shell wins', () => {
    const envFile = '# my settings\nDEVHUB_PORT=4320\nLOG_LEVEL=debug\n';

    expect(loadConfig({ env: {}, envFile })).toMatchObject({ port: 4320, logLevel: 'debug' });
    expect(loadConfig({ env: { DEVHUB_PORT: '4321' }, envFile })).toMatchObject({ port: 4321, logLevel: 'debug' });
  });

  it('AC-13: stops on a switch that is not true or false, and names it', () => {
    expect(() => loadConfig({ env: {}, envFile: 'DEVHUB_TOKENS_FROM_ENV=maybe\n' })).toThrow(
      /Orynx settings are not valid[\s\S]*DEVHUB_TOKENS_FROM_ENV/,
    );
  });

  it('AC-7: with the switch off, hands core no tokens and lists the ones it ignores', () => {
    const config = loadConfig({ env: { DEVHUB_GITHUB_TOKEN: githubToken, DEVHUB_JIRA_API_TOKEN: '' } });

    expect(config.tokens).toEqual({ fromEnv: false, env: {}, ignored: ['DEVHUB_GITHUB_TOKEN'] });
  });

  it('treats an empty shell variable as not set, so the .env value still counts', () => {
    const envFile = `DEVHUB_PORT=4320\nDEVHUB_TOKENS_FROM_ENV=true\nDEVHUB_JIRA_API_TOKEN=${jiraToken}\n`;

    const config = loadConfig({ env: { DEVHUB_PORT: '', DEVHUB_JIRA_API_TOKEN: '' }, envFile });

    expect(config).toMatchObject({ port: 4320, tokens: { env: { jira: jiraToken } } });
  });

  it('AC-8: with the switch on, hands core the .env tokens by tool', () => {
    const envFile = `DEVHUB_TOKENS_FROM_ENV=true\nDEVHUB_JIRA_API_TOKEN=${jiraToken}\nDEVHUB_SLACK_USER_TOKEN=\n`;

    const config = loadConfig({ env: { DEVHUB_GITHUB_TOKEN: githubToken }, envFile });

    expect(config.tokens).toEqual({ fromEnv: true, env: { jira: jiraToken, github: githubToken }, ignored: [] });
  });
});

describe('forgetTokenSettings', () => {
  it('AC-14: removes the token settings once read, so no child process inherits a token', () => {
    const env: NodeJS.ProcessEnv = { DEVHUB_PORT: '4320', DEVHUB_GITHUB_TOKEN: githubToken, PATH: '/usr/bin' };

    forgetTokenSettings(env);

    expect(env).toEqual({ DEVHUB_PORT: '4320', PATH: '/usr/bin' });
  });
});

describe('readEnvFile', () => {
  const folder = mkdtempSync(join(tmpdir(), 'devhub-env-'));

  it('AC-12: looks for .env next to .env.example at the repo root', () => {
    expect(basename(repoEnvFile)).toBe('.env');
    expect(existsSync(join(dirname(repoEnvFile), '.env.example'))).toBe(true);
  });

  it('returns nothing when there is no .env file', () => {
    expect(readEnvFile(join(folder, 'missing.env'))).toBeUndefined();
  });

  it('reads the file and says whether other users on this computer can read it', () => {
    const path = join(folder, '.env');
    writeFileSync(path, 'DEVHUB_PORT=4320\n');

    chmodSync(path, 0o600);
    expect(readEnvFile(path)).toEqual({ text: 'DEVHUB_PORT=4320\n', othersCanRead: false, holdsTokens: false });

    chmodSync(path, 0o640);
    expect(readEnvFile(path)?.othersCanRead).toBe(true);

    // Write and execute bits alone don't let anyone read it.
    chmodSync(path, 0o622);
    expect(readEnvFile(path)?.othersCanRead).toBe(false);
  });

  it('says whether the file holds a token, set or not', () => {
    const path = join(folder, 'tokens.env');
    writeFileSync(path, `DEVHUB_TOKENS_FROM_ENV=false\nDEVHUB_GITHUB_TOKEN=\nDEVHUB_JIRA_API_TOKEN=${jiraToken}\n`);
    expect(readEnvFile(path)?.holdsTokens).toBe(true);

    writeFileSync(path, 'DEVHUB_TOKENS_FROM_ENV=true\nDEVHUB_GITHUB_TOKEN=\n');
    expect(readEnvFile(path)?.holdsTokens).toBe(false);
  });

  it('stops when .env is there but cannot be read, rather than starting without it', () => {
    expect(() => readEnvFile(folder)).toThrow(/EISDIR/);
  });
});
