import type { OrynxVersion, RunningVersion } from '@devhub/contracts';

/** Spec 045: release versions as major.minor.patch numbers, with no dependency (Assumptions). */

const releaseTag = /^v(\d+\.\d+\.\d+)$/;

/** `v0.1.37` → `0.1.37`; null for any other tag, a prerelease's included. */
export function versionOfTag(tag: string): OrynxVersion | null {
  return releaseTag.exec(tag)?.[1] ?? null;
}

/** Below zero when `a` is older, above when it's newer: `0.1.10` is newer than `0.1.9`. */
export function compareVersions(a: OrynxVersion, b: OrynxVersion): number {
  const [left, right] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let part = 0; part < 3; part++) {
    const difference = (left[part] ?? 0) - (right[part] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Newer than the release you run, or any release at all for a clone with none in its history (AC-7). */
export function isNewer(version: OrynxVersion, running: OrynxVersion | null): boolean {
  return running === null || compareVersions(version, running) > 0;
}

const commit = /^[0-9a-f]{7,40}$/;

/**
 * A clone's version from `git describe --tags --match 'v*' --long` (`v0.1.37-4-gabc1234`), or from
 * `git rev-parse --short HEAD` alone when no release tag is in its history (AC-2). Null for anything else.
 */
export function readDescribe(output: string): RunningVersion | null {
  const text = output.trim();
  if (commit.test(text)) return { release: null, commits: 0, commit: text };
  const described = /^(.+)-(\d+)-g([0-9a-f]{7,40})$/.exec(text);
  if (described === null) return null;
  const [, tag = '', commits = '0', sha = ''] = described;
  const release = versionOfTag(tag);
  return release === null
    ? { release: null, commits: 0, commit: sha }
    : { release, commits: Number(commits), commit: sha };
}
