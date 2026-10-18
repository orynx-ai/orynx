/**
 * The environment the coding agent's programs get (spec 010): what Claude Code needs to find its login
 * and reach Claude, and nothing of DevHub's own. It's an allow list, so no `DEVHUB_*` variable, no `.env`
 * token and no session token can get through unless someone adds it here. Sessions start with the same
 * list (spec 011), and the git that makes their worktrees gets it too (`gitEnvironment`).
 */

/** The account, the shell and the language. */
const names = new Set([
  'HOME',
  'USER',
  'LOGNAME',
  'PATH',
  'SHELL',
  'TMPDIR',
  'LANG',
  // A company's own certificates, for a network that inspects TLS.
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
]);

/** Proxy settings, which tools spell in either case. */
const proxyNames = new Set(['https_proxy', 'http_proxy', 'no_proxy']);

/** The locale and Claude's own settings. */
const prefixes = ['LC_', 'CLAUDE_', 'ANTHROPIC_'];

/**
 * The cloud logins Claude Code can sign in through, passed only when Claude Code is set to use that
 * cloud, so a session's programs never inherit credentials Claude isn't using (spec 011, Q8b).
 */
const clouds = [
  { flag: 'CLAUDE_CODE_USE_BEDROCK', prefixes: ['AWS_'], names: [] },
  // Google Vertex AI's region sits beside the GOOGLE_* logins.
  { flag: 'CLAUDE_CODE_USE_VERTEX', prefixes: ['GOOGLE_'], names: ['CLOUD_ML_REGION'] },
] as const;

/** Claude Code reads a switch like CLAUDE_CODE_USE_BEDROCK as on when it's one of these. */
function switchedOn(value: string | undefined): boolean {
  return value !== undefined && /^(?:1|true|yes|on)$/i.test(value.trim());
}

/**
 * What a Claude Code session sets for the programs it starts, such as its id and its messaging token.
 * Orynx started from a Claude Code terminal has them, but the programs Orynx starts aren't part of
 * that session, so they never get them.
 */
const sessionNames = new Set([
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_PLUGIN_ROOT',
]);
const sessionPrefixes = ['CLAUDE_CODE_SESSION_', 'CLAUDE_CODE_MESSAGING_'];

function fromAClaudeSession(name: string): boolean {
  return sessionNames.has(name) || sessionPrefixes.some((prefix) => name.startsWith(prefix));
}

type Environment = Readonly<Record<string, string | undefined>>;

function allowed(name: string, env: Environment): boolean {
  if (fromAClaudeSession(name)) return false;
  if (names.has(name) || proxyNames.has(name.toLowerCase()) || prefixes.some((prefix) => name.startsWith(prefix))) {
    return true;
  }
  return clouds.some(
    (cloud) =>
      switchedOn(env[cloud.flag]) &&
      (cloud.prefixes.some((prefix) => name.startsWith(prefix)) || (cloud.names as readonly string[]).includes(name)),
  );
}

/** The allowed variables of `env` that have a value. Pass the host's `process.env`; nothing else is read. */
export function agentEnvironment(env: Environment): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && allowed(name, env)) out[name] = value;
  }
  return out;
}

/**
 * The environment of the git that makes, fetches and removes a session's worktree (spec 011, Q8d): the
 * same short list, your SSH agent so an SSH fetch can sign in, and never a password prompt, because no
 * one is at a terminal to answer it.
 */
export function gitEnvironment(env: Environment): Record<string, string> {
  const agent = env['SSH_AUTH_SOCK'];
  return {
    ...agentEnvironment(env),
    ...(agent === undefined ? {} : { SSH_AUTH_SOCK: agent }),
    GIT_TERMINAL_PROMPT: '0',
  };
}
