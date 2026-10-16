import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('uses the spec defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      port: 4317,
      home: join(homedir(), '.devhub'),
      logLevel: 'info',
      pretty: true,
    });
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      DEVHUB_PORT: '5999',
      DEVHUB_HOME: '/tmp/devhub-test',
      LOG_LEVEL: 'warn',
      NODE_ENV: 'production',
    });
    expect(config).toEqual({ port: 5999, home: '/tmp/devhub-test', logLevel: 'warn', pretty: false });
  });

  it('treats an empty DEVHUB_HOME as the default, like the blank line in .env.example', () => {
    expect(loadConfig({ DEVHUB_HOME: '' }).home).toBe(join(homedir(), '.devhub'));
  });

  it('explains which setting is wrong', () => {
    expect(() => loadConfig({ DEVHUB_PORT: 'nope' })).toThrow(/DEVHUB_PORT/);
  });
});
