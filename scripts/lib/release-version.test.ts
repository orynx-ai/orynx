import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { releaseVersion, stampReleaseVersion } from './release-version.ts';

describe('releaseVersion', () => {
  it('AC-32: keeps major.minor from apps/desktop and takes the run number as the patch', () => {
    assert.equal(releaseVersion('0.1.0', '37'), '0.1.37');
    assert.equal(releaseVersion('0.2.5', '38'), '0.2.38');
    assert.equal(releaseVersion('1.0.0', '1'), '1.0.1');
  });

  it('refuses a run number or a version it cannot read, so CI never ships a made-up version', () => {
    assert.throws(() => releaseVersion('0.1.0', ''), /run number/);
    assert.throws(() => releaseVersion('0.1.0', '3.5'), /run number/);
    assert.throws(() => releaseVersion('0.1.0', '0'), /run number/);
    assert.throws(() => releaseVersion('0.1', '37'), /apps\/desktop\/package\.json/);
    assert.throws(() => releaseVersion('v0.1.0', '37'), /apps\/desktop\/package\.json/);
  });
});

describe('stampReleaseVersion', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'devhub-release-version-'));
    for (const [app, version] of [
      ['desktop', '0.1.0'],
      ['server', '0.1.0'],
    ] as const) {
      mkdirSync(join(root, 'apps', app), { recursive: true });
      writeFileSync(
        join(root, 'apps', app, 'package.json'),
        `${JSON.stringify({ name: `@devhub/${app}`, version, private: true }, null, 2)}\n`,
      );
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('AC-22, AC-32: writes the version into the app and the hub, so About Orynx and /api/status agree', () => {
    assert.equal(stampReleaseVersion(root, '37'), '0.1.37');

    for (const app of ['desktop', 'server']) {
      const json = JSON.parse(readFileSync(join(root, 'apps', app, 'package.json'), 'utf8')) as Record<string, unknown>;
      assert.deepEqual(json, { name: `@devhub/${app}`, version: '0.1.37', private: true });
    }
  });
});
