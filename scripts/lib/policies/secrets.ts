import { applyIgnores, makeLineLookup, type Finding } from '../gate.ts';

export const SECRETS_GATE_ID = 'secrets';

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|mp4|webm|mov)$/i;
const SKIPPED = new Set(['pnpm-lock.yaml']);

/** Content scanning skips binaries and the lockfile (integrity hashes look like noise). */
export function shouldScanContent(path: string): boolean {
  return !BINARY.test(path) && !SKIPPED.has(path);
}

const FIX_FILE = 'remove it from git (`git rm --cached <file>`); keep secrets in the OS keychain or an ignored .env';

/** Files that must never be committed, whatever they contain. */
export function checkSecretFileName(path: string): Finding | null {
  const base = path.split('/').pop() ?? path;
  const bad =
    ((base === '.env' || base.startsWith('.env.')) && base !== '.env.example') ||
    /\.(pem|p12|pfx|key)$/i.test(base) ||
    /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(base);
  if (!bad) return null;
  return { file: path, line: 0, rule: 'secret-file', message: `"${base}" is a secrets file`, fix: FIX_FILE };
}

const TOKEN_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'GitHub fine-grained token', pattern: /github_pat_[A-Za-z0-9_]{50,}/g },
  { name: 'Slack token', pattern: /xox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: 'Atlassian API token', pattern: /ATATT[A-Za-z0-9_\-=]{20,}/g },
  { name: 'Anthropic API key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g },
];

function mask(value: string): string {
  return `${value.slice(0, 6)}…`;
}

export function findSecretsInContent(path: string, content: string): Finding[] {
  const lineOf = makeLineLookup(content);
  const findings: Finding[] = [];
  for (const { name, pattern } of TOKEN_PATTERNS) {
    for (const m of content.matchAll(pattern)) {
      findings.push({
        file: path,
        line: lineOf(m.index),
        rule: 'secret-value',
        message: `looks like a ${name} (${mask(m[0])})`,
        fix: 'remove it and revoke it at its provider; DevHub keeps tokens in the OS keychain, never in files',
      });
    }
  }
  return applyIgnores(SECRETS_GATE_ID, path, content, findings);
}
