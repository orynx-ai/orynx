import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findDeclaredEnvKeys,
  findEnvReads,
  findEnvViolations,
  inEnvScope,
  isEnvReader,
  parseEnvExample,
} from './env.ts';

const EXAMPLE = parseEnvExample('# comment\nDEVHUB_PORT=4317\nDEVHUB_HOME=\nLOG_LEVEL=info\nNODE_ENV=development\n');

describe('parsers', () => {
  it('parses .env.example keys', () => {
    assert.deepEqual([...EXAMPLE].sort(), ['DEVHUB_HOME', 'DEVHUB_PORT', 'LOG_LEVEL', 'NODE_ENV']);
  });

  it('finds env reads in every form', () => {
    const refs = findEnvReads(
      `const a = process.env.DEVHUB_PORT;\nconst b = process.env['LOG_LEVEL'];\nconst c = import.meta.env.DEV;\nparse(process.env);`,
    );
    assert.deepEqual(
      refs.map((r) => `${r.key ?? '*'}:${r.source}@${r.line}`),
      ['DEVHUB_PORT:process@1', 'LOG_LEVEL:process@2', 'DEV:import-meta@3', '*:process@4'],
    );
  });

  it('finds UPPER_SNAKE keys declared in a schema', () => {
    const keys = findDeclaredEnvKeys(
      `const Env = z.object({\n  DEVHUB_PORT: z.coerce.number(),\n  "LOG_LEVEL": z.string(),\n  port: 1,\n});`,
    );
    assert.deepEqual(
      keys.map((k) => k.key),
      ['DEVHUB_PORT', 'LOG_LEVEL'],
    );
  });
});

describe('scope', () => {
  it('knows readers and scope', () => {
    assert.equal(isEnvReader('apps/server/src/config.ts'), true);
    assert.equal(isEnvReader('apps/web/vite.config.ts'), true);
    assert.equal(isEnvReader('packages/core/src/config.ts'), false);
    assert.equal(inEnvScope('packages/core/src/x.ts'), true);
    assert.equal(inEnvScope('vitest.config.ts'), true);
    assert.equal(inEnvScope('scripts/run-gates.ts'), false);
  });
});

describe('findEnvViolations', () => {
  it('rejects env reads outside config files', () => {
    const found = findEnvViolations(
      'packages/core/src/create-server.ts',
      `const port = process.env.DEVHUB_PORT;`,
      EXAMPLE,
    );
    assert.deepEqual(
      found.map((f) => f.rule),
      ['env-outside-config'],
    );
    assert.match(found[0]?.fix ?? '', /config\.ts/);
  });

  it('lets root config files read CI but nothing else', () => {
    assert.deepEqual(findEnvViolations('vitest.config.ts', `const ci = !!process.env.CI;`, EXAMPLE), []);
    assert.deepEqual(
      findEnvViolations('vitest.config.ts', `const p = process.env.DEVHUB_PORT;`, EXAMPLE).map((f) => f.rule),
      ['env-outside-config'],
    );
  });

  it('requires every key a config file uses to be in .env.example', () => {
    const src = `const Env = z.object({\n  DEVHUB_PORT: z.coerce.number(),\n  DEVHUB_SECRET_MODE: z.string(),\n});\nexport const env = Env.parse(process.env);`;
    const found = findEnvViolations('apps/server/src/config.ts', src, EXAMPLE);
    assert.deepEqual(
      found.map((f) => f.message),
      [`setting "DEVHUB_SECRET_MODE" is not listed in .env.example`],
    );
    assert.equal(found[0]?.line, 3);
  });

  it("allows built-in keys and Vite's import.meta.env keys", () => {
    assert.deepEqual(
      findEnvViolations(
        'apps/web/src/config.ts',
        `export const dev = import.meta.env.DEV;\nconst h = process.env.HOME;`,
        EXAMPLE,
      ),
      [],
    );
  });
});
