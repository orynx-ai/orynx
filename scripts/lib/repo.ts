import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Absolute path of the repository root. This file lives in scripts/lib/. */
export const repoRoot: string = resolve(import.meta.dirname, '..', '..');

/** Runs git and returns stdout. Throws when git exits non-zero, so callers fail loudly. */
export function git(args: readonly string[], cwd: string = repoRoot): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 512 * 1024 * 1024,
  });
}

/** Like git(), but returns null instead of throwing. Use only where "no answer" is a valid answer. */
export function tryGit(args: readonly string[], cwd: string = repoRoot): string | null {
  try {
    return git(args, cwd).trim();
  } catch {
    return null;
  }
}

/** Every file git knows about or would add: tracked plus untracked-but-not-ignored. Repo-relative, POSIX. */
export function listFiles(root: string = repoRoot): string[] {
  const out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root);
  const files = new Set<string>();
  for (const file of out.split('\0')) {
    // A tracked file deleted from the working tree is still in the index; skip it.
    if (file.length > 0 && existsSync(join(root, file))) files.add(file);
  }
  return [...files].sort();
}

export function readText(path: string, root: string = repoRoot): string {
  return readFileSync(join(root, path), 'utf8');
}

export function toPosix(path: string): string {
  return path.split(sep).join('/');
}

/** Turns an absolute or relative path into a repo-relative POSIX path, or null when it is outside the repo. */
export function toRepoPath(path: string, root: string = repoRoot): string | null {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  const rel = relative(root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
  return toPosix(rel);
}

export function hasExtension(path: string, extensions: readonly string[]): boolean {
  return extensions.some((ext) => path.endsWith(ext));
}

/** Minimal glob: `**` spans directories, `*` stays inside one segment, `?` is one character. */
export function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob.charAt(i);
    if (ch === '*') {
      if (glob.charAt(i + 1) === '*') {
        const slashAfter = glob.charAt(i + 2) === '/';
        pattern += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else {
        pattern += '[^/]*';
      }
    } else if (ch === '?') {
      pattern += '[^/]';
    } else {
      pattern += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
}
