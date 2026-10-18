import { GitHubRepositorySchema } from '@devhub/contracts';

/**
 * Which repository on github.com a git remote's address names (spec 014): `owner/name`, or null when it isn't one
 * on github.com. Only github.com counts (spec 004), so GitHub Enterprise, another host and an SSH host alias from
 * `~/.ssh/config` don't. A user name or password in the address is never kept: only the owner and name come back,
 * so nothing else in the address can reach the page or the log.
 */

/** The ports each way of reaching github.com may name; '' is the scheme's own. */
const allowedPorts: Record<string, readonly string[]> = {
  'https:': [''],
  'http:': [''],
  'git:': [''],
  'ssh:': ['', '22'],
};

/** GitHub's SSH over the https port, as its own docs give it. */
const sshOverHttps = 'ssh.github.com';

/** `git@github.com:acme/web-app.git`, git's short form for SSH: an optional user, the host, a colon, the path. */
const scpLike = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(\S+)$/;

/** `owner/name` from a path such as `/acme/web-app.git/`, or null when it's anything else. */
function fromPath(path: string): string | null {
  const repository = path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  return GitHubRepositorySchema.safeParse(repository).success ? repository : null;
}

function fromUrl(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const ports = allowedPorts[url.protocol];
  if (ports === undefined) return null;
  const onGitHub =
    (host === 'github.com' && ports.includes(url.port)) ||
    (url.protocol === 'ssh:' && host === sshOverHttps && url.port === '443');
  return onGitHub ? fromPath(url.pathname) : null;
}

export function githubRepository(address: string): string | null {
  const trimmed = address.trim();
  if (trimmed === '') return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return fromUrl(trimmed);
  const short = scpLike.exec(trimmed);
  if (short === null) return null;
  const [, host = '', path = ''] = short;
  return host.toLowerCase() === 'github.com' ? fromPath(path) : null;
}
