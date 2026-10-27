import { describe, expect, it } from 'vitest';
import { compareVersions, isNewer, readDescribe, versionOfTag } from './versions.ts';

describe('versions (spec 045)', () => {
  it('AC-14: reads a release tag as its version, and nothing else as one', () => {
    expect(versionOfTag('v0.1.37')).toBe('0.1.37');
    expect(versionOfTag('v10.20.300')).toBe('10.20.300');
    for (const tag of ['0.1.37', 'v0.1', 'v0.1.37-beta.1', 'v0.1.37.4', 'release-1', 'v01.2.3x', '']) {
      expect(versionOfTag(tag)).toBeNull();
    }
  });

  it('AC-7, AC-14: compares major.minor.patch as numbers, not as text', () => {
    expect(compareVersions('0.1.40', '0.1.37')).toBeGreaterThan(0);
    expect(compareVersions('0.1.37', '0.1.40')).toBeLessThan(0);
    expect(compareVersions('0.1.37', '0.1.37')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    expect(['0.1.9', '0.1.10', '0.2.0', '0.1.2'].sort(compareVersions)).toEqual(['0.1.2', '0.1.9', '0.1.10', '0.2.0']);
  });

  it('AC-7: a release is newer than yours when its version is higher, or when a clone has no release yet', () => {
    expect(isNewer('0.1.40', '0.1.37')).toBe(true);
    expect(isNewer('0.1.37', '0.1.37')).toBe(false);
    expect(isNewer('0.1.36', '0.1.37')).toBe(false);
    expect(isNewer('0.1.0', null)).toBe(true);
  });

  it('AC-2: reads `git describe --long` on a tag, after one, and with no tag to describe', () => {
    expect(readDescribe('v0.1.37-0-gabc1234\n')).toEqual({ release: '0.1.37', commits: 0, commit: 'abc1234' });
    expect(readDescribe('v0.1.37-4-gabc1234')).toEqual({ release: '0.1.37', commits: 4, commit: 'abc1234' });
    // A tag with a hyphen of its own still splits at the last two.
    expect(readDescribe('v0.1.37-rc-2-g0123456789ab')).toEqual({ release: null, commits: 0, commit: '0123456789ab' });
    // `git rev-parse --short HEAD` alone, for a clone with no release tag in its history.
    expect(readDescribe('abc1234')).toEqual({ release: null, commits: 0, commit: 'abc1234' });
    expect(readDescribe('fatal: No names found')).toBeNull();
    expect(readDescribe('')).toBeNull();
  });
});
