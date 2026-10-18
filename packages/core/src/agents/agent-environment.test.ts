import { describe, expect, it } from 'vitest';
import { agentEnvironment } from './agent-environment.ts';

describe('agentEnvironment', () => {
  it.each([
    ['HOME', '/Users/you'],
    ['USER', 'you'],
    ['LOGNAME', 'you'],
    ['PATH', '/usr/bin:/bin'],
    ['SHELL', '/bin/zsh'],
    ['TMPDIR', '/var/folders/x/'],
    ['LANG', 'en_GB.UTF-8'],
    ['LC_ALL', 'en_GB.UTF-8'],
    ['LC_CTYPE', 'UTF-8'],
    ['CLAUDE_CONFIG_DIR', '/tmp/empty-claude'],
    ['CLAUDE_CODE_USE_BEDROCK', '1'],
    ['ANTHROPIC_API_KEY', 'fake-key-for-tests'],
    ['ANTHROPIC_BASE_URL', 'https://gateway.example'],
    ['AWS_PROFILE', 'work'],
    ['AWS_REGION', 'eu-west-1'],
    ['GOOGLE_APPLICATION_CREDENTIALS', '/Users/you/gcloud.json'],
    ['CLOUD_ML_REGION', 'europe-west1'],
    ['HTTPS_PROXY', 'http://proxy:8080'],
    ['https_proxy', 'http://proxy:8080'],
    ['HTTP_PROXY', 'http://proxy:8080'],
    ['http_proxy', 'http://proxy:8080'],
    ['NO_PROXY', 'localhost'],
    ['no_proxy', 'localhost'],
    ['NODE_EXTRA_CA_CERTS', '/etc/company-ca.pem'],
    ['SSL_CERT_FILE', '/etc/ssl/cert.pem'],
  ])('AC-10: lets %s through', (name, value) => {
    expect(agentEnvironment({ [name]: value })).toEqual({ [name]: value });
  });

  it.each([
    // DevHub's own settings, including the tokens .env may hold and the session token's home.
    'DEVHUB_JIRA_API_TOKEN',
    'DEVHUB_GITHUB_TOKEN',
    'DEVHUB_SLACK_USER_TOKEN',
    'DEVHUB_TOKENS_FROM_ENV',
    'DEVHUB_HOME',
    'DEVHUB_PORT',
    'DEVHUB_KEYCHAIN',
    'DEVHUB_CLAUDE_CODE',
    // Anything else in the terminal that started DevHub.
    'NODE_OPTIONS',
    'NODE_ENV',
    'LOG_LEVEL',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'NPM_TOKEN',
    'CLAUDECODE',
    'LANGUAGE',
  ])('AC-10: keeps %s out', (name) => {
    expect(agentEnvironment({ [name]: 'fake-value-for-tests' })).toEqual({});
  });

  it.each([
    // What a Claude Code session sets for the programs it starts. Orynx started from a Claude Code
    // terminal has them, but the programs Orynx starts aren't part of that session.
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_SESSION_ATTENDED',
    'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
    'CLAUDE_CODE_MESSAGING_SOCKET',
    'CLAUDE_CODE_MESSAGING_TOKEN',
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_EXECPATH',
    'CLAUDE_CODE_SSE_PORT',
    'CLAUDE_PID',
    'CLAUDE_EFFORT',
    'CLAUDE_PROJECT_DIR',
    'CLAUDE_ENV_FILE',
    'CLAUDE_PLUGIN_ROOT',
  ])('AC-10: keeps out %s, which belongs to the Claude Code session that started Orynx', (name) => {
    expect(agentEnvironment({ [name]: 'fake-value-for-tests' })).toEqual({});
  });

  it.each(['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS'])(
    'AC-10: still lets your own Claude Code setting %s through',
    (name) => {
      expect(agentEnvironment({ [name]: '1' })).toEqual({ [name]: '1' });
    },
  );

  it('AC-10: keeps the allowed variables of a whole environment and drops the rest', () => {
    expect(
      agentEnvironment({
        HOME: '/Users/you',
        PATH: '/usr/bin',
        DEVHUB_GITHUB_TOKEN: 'fake-token-for-tests',
        CLAUDE_CONFIG_DIR: '/tmp/empty-claude',
        NODE_OPTIONS: '--require ./steal.js',
        UNSET: undefined,
      }),
    ).toEqual({ HOME: '/Users/you', PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/tmp/empty-claude' });
  });

  it('leaves out a variable that is listed but has no value', () => {
    expect(agentEnvironment({ HOME: undefined })).toEqual({});
  });
});
