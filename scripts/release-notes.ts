// Prints the notes for a release made at a commit (spec 045): its feat and fix commits since the last release.
// release.yml passes them to `gh release create`; empty means the release has no notes.
//
// Usage: node scripts/release-notes.ts [commit, HEAD by default]
import { notesSinceLastRelease } from './lib/release-notes.ts';

try {
  process.stdout.write(notesSinceLastRelease(process.argv[2] ?? 'HEAD'));
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
