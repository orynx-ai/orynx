import { describe, expect, it } from 'vitest';
import { githubRelease } from '../../test/fake-releases.ts';
import { publishedReleases } from './map.ts';

describe('publishedReleases (spec 045)', () => {
  it('AC-14: keeps published releases with a release tag, newest version first, at most 10', () => {
    const found = Array.from({ length: 12 }, (_, index) => githubRelease({ tag_name: `v0.1.${String(29 + index)}` }));
    const releases = publishedReleases(found);
    expect(releases.map((release) => release.version)).toEqual([
      '0.1.40',
      '0.1.39',
      '0.1.38',
      '0.1.37',
      '0.1.36',
      '0.1.35',
      '0.1.34',
      '0.1.33',
      '0.1.32',
      '0.1.31',
    ]);
    expect(releases[0]).toEqual({
      version: '0.1.40',
      publishedAt: '2026-10-22T10:00:00.000Z',
      notes: '## New\n\n- Show the inbox tabs',
      url: 'https://github.com/orynx-ai/orynx/releases/tag/v0.1.40',
    });
  });

  it('AC-12: leaves out drafts, prereleases, tags that are not a release, and pages off github.com', () => {
    const releases = publishedReleases([
      githubRelease({ tag_name: 'v0.1.41', draft: true, published_at: null }),
      githubRelease({ tag_name: 'v0.1.41-beta.1', prerelease: true }),
      githubRelease({ tag_name: 'nightly' }),
      githubRelease({ tag_name: 'v0.1.39', html_url: 'https://evil.dev/orynx/releases/tag/v0.1.39' }),
      githubRelease({ tag_name: 'v0.1.38', published_at: null }),
      githubRelease({ tag_name: 'v0.1.40' }),
    ]);
    expect(releases.map((release) => release.version)).toEqual(['0.1.40']);
  });

  it('AC-17: a release with no notes has empty notes', () => {
    expect(publishedReleases([githubRelease({ body: null })])[0]?.notes).toBe('');
    expect(publishedReleases([githubRelease({ body: '  \n' })])[0]?.notes).toBe('');
  });

  it('AC-10: anything that is not a list of releases reads as none', () => {
    expect(publishedReleases([{ tag_name: 3 }, null, 'v0.1.40'])).toEqual([]);
  });
});
