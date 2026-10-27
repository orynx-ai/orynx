import { z } from 'zod';
import { GitHubLinkSchema } from '@devhub/contracts';
import { compareVersions, versionOfTag } from '../../updates/versions.ts';

/** A published release as the update service marks it newer or yours (spec 045). */
export interface PublishedRelease {
  version: string;
  publishedAt: string;
  /** Markdown from GitHub, empty when it has none (AC-17). */
  notes: string;
  url: string;
}

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  body: z.string().nullish(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.iso.datetime({ offset: true }).nullable(),
  html_url: GitHubLinkSchema,
});

/**
 * GitHub's list as What's new shows it: published releases with a `v0.1.40` tag and a page on github.com, newest
 * version first, at most 10 (Q8). A draft, a prerelease or anything GitHub sent that doesn't read is left out.
 */
export function publishedReleases(found: readonly unknown[]): PublishedRelease[] {
  const releases: PublishedRelease[] = [];
  for (const item of found) {
    const release = GitHubReleaseSchema.safeParse(item);
    if (!release.success || release.data.draft || release.data.prerelease) continue;
    const version = versionOfTag(release.data.tag_name);
    const at = release.data.published_at;
    if (version === null || at === null) continue;
    releases.push({
      version,
      publishedAt: new Date(at).toISOString(),
      notes: release.data.body?.trim() ?? '',
      url: release.data.html_url,
    });
  }
  return releases.sort((a, b) => compareVersions(b.version, a.version)).slice(0, 10);
}
