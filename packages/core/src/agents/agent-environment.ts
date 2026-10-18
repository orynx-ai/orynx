/**
 * The environment the coding agent's programs get (spec 010): what Claude Code needs to find its login
 * and reach Claude, and nothing of DevHub's own. It's an allow list, so no `DEVHUB_*` variable, no `.env`
 * token and no session token can get through unless someone adds it here. Spec 011 starts sessions
 * with the same list.
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
  // Google Vertex AI's region, beside the GOOGLE_* logins.
  'CLOUD_ML_REGION',
  // A company's own certificates, for a network that inspects TLS.
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
]);

/** Proxy settings, which tools spell in either case. */
const proxyNames = new Set(['https_proxy', 'http_proxy', 'no_proxy']);

/** The locale, Claude's own settings, and the cloud logins Claude Code can sign in through. */
const prefixes = ['LC_', 'CLAUDE_', 'ANTHROPIC_', 'AWS_', 'GOOGLE_'];

function allowed(name: string): boolean {
  return names.has(name) || proxyNames.has(name.toLowerCase()) || prefixes.some((prefix) => name.startsWith(prefix));
}

/** The allowed variables of `env` that have a value. Pass the host's `process.env`; nothing else is read. */
export function agentEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && allowed(name)) out[name] = value;
  }
  return out;
}
