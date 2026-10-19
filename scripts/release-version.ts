// Stamps the release's version into apps/desktop and apps/server (spec 027) and prints it. CI runs it before
// packing; nothing is committed.
//
// Usage: node scripts/release-version.ts <run number>
import { repoRoot } from './lib/repo.ts';
import { stampReleaseVersion } from './lib/release-version.ts';

try {
  console.log(stampReleaseVersion(repoRoot, process.argv[2] ?? ''));
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
