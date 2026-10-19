import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const semver = /^(\d+)\.(\d+)\.(\d+)$/;

/** major.minor from apps/desktop/package.json, and the CI run number as the patch (spec 027, Q10). */
export function releaseVersion(current: string, runNumber: string): string {
  if (!/^[1-9]\d*$/.test(runNumber)) throw new Error(`"${runNumber}" is not a CI run number`);
  const parts = semver.exec(current);
  if (parts === null) throw new Error(`apps/desktop/package.json has version "${current}"; it needs major.minor.patch`);
  return `${parts[1] ?? ''}.${parts[2] ?? ''}.${runNumber}`;
}

function setVersion(path: string, version: string): void {
  const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  writeFileSync(path, `${JSON.stringify({ ...json, version }, null, 2)}\n`);
}

/**
 * Writes the release's version into the app (About Orynx, the installers' names) and the hub (/api/status),
 * in the CI checkout only: nothing is committed. Returns the version.
 */
export function stampReleaseVersion(root: string, runNumber: string): string {
  const desktop = join(root, 'apps', 'desktop', 'package.json');
  const { version } = JSON.parse(readFileSync(desktop, 'utf8')) as { version: string };
  const next = releaseVersion(version, runNumber);
  setVersion(desktop, next);
  setVersion(join(root, 'apps', 'server', 'package.json'), next);
  return next;
}
