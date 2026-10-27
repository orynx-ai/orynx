import { git, repoRoot, tryGit } from './repo.ts';

/** A Conventional Commit subject: its type, an optional scope, an optional `!`, then what changed. */
const conventional = /^(\w+)(?:\([^)]*\))?!?: (.+)$/;

/**
 * A release's notes (spec 045, Q4a): each `feat` under "New" and each `fix` under "Fixed", as written, with the
 * scope left out and a capital first letter; every other type is skipped. Empty when there is neither (AC-35).
 * `subjects` come oldest first, as the notes list them.
 */
export function releaseNotes(subjects: readonly string[]): string {
  const added: string[] = [];
  const fixed: string[] = [];
  for (const subject of subjects) {
    const [, type, text = ''] = conventional.exec(subject.trim()) ?? [];
    const item = `- ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
    if (type === 'feat') added.push(item);
    if (type === 'fix') fixed.push(item);
  }
  const sections: [string, string[]][] = [
    ['New', added],
    ['Fixed', fixed],
  ];
  return sections
    .filter(([, items]) => items.length > 0)
    .map(([heading, items]) => `## ${heading}\n\n${items.join('\n')}\n`)
    .join('\n');
}

/**
 * The notes for a release made at `head`: the commits since the last `v0.1.37` release tag in its history, or
 * every commit on the way to it for the first release (AC-36). Merge commits are left out.
 */
export function notesSinceLastRelease(head: string, cwd: string = repoRoot): string {
  const last = tryGit(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*', head], cwd);
  const range = last === null ? head : `${last}..${head}`;
  const subjects = git(['log', '--reverse', '--no-merges', '--format=%s', range], cwd)
    .split('\n')
    .filter((line) => line !== '');
  return releaseNotes(subjects);
}
