import { applyIgnores, makeLineLookup, type Finding } from '../gate.ts';
import { scanSource } from '../source-scan.ts';

export const ENV_GATE_ID = 'env-policy';

/** The only files allowed to read the environment. */
const READERS: readonly RegExp[] = [
  /^apps\/[^/]+\/src\/config\.ts$/,
  /^apps\/web\/vite\.config\.ts$/,
  /^playwright\.config\.ts$/,
];

/** Config files (outside src/) that may read the built-in keys below, e.g. `process.env.CI` in vitest.config.ts. */
const CONFIG_FILES: readonly RegExp[] = [
  /^[^/]+\.config\.[cm]?ts$/,
  /^(?:apps|packages)\/[^/]+\/[^/]+\.config\.[cm]?ts$/,
];

/** Keys provided by the OS or CI that never belong in .env.example. */
export const BUILTIN_ENV_KEYS: ReadonlySet<string> = new Set(['CI', 'HOME', 'USERPROFILE', 'PATH']);
/** Keys Vite defines on import.meta.env. */
export const VITE_ENV_KEYS: ReadonlySet<string> = new Set(['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL']);

export function isEnvReader(path: string): boolean {
  return READERS.some((r) => r.test(path));
}

export function inEnvScope(path: string): boolean {
  if (!/\.[cm]?tsx?$/.test(path)) return false;
  return /^(?:apps|packages)\/[^/]+\/src\//.test(path) || CONFIG_FILES.some((r) => r.test(path));
}

export interface EnvRef {
  /** The key read, or null for bare `process.env` (e.g. passed whole to a zod schema). */
  key: string | null;
  line: number;
  source: 'process' | 'import-meta';
}

export function findEnvReads(content: string): EnvRef[] {
  const { code } = scanSource(content, 'ts');
  const lineOf = makeLineLookup(content);
  const refs: EnvRef[] = [];
  for (const m of code.matchAll(/\bprocess\.env\b(?:\.([A-Za-z_$][\w$]*)|\[\s*(['"`])([^'"`]+)\2\s*\])?/g)) {
    refs.push({ key: m[1] ?? m[3] ?? null, line: lineOf(m.index), source: 'process' });
  }
  for (const m of code.matchAll(/\bimport\.meta\.env\b(?:\.([A-Za-z_$][\w$]*)|\[\s*(['"`])([^'"`]+)\2\s*\])?/g)) {
    refs.push({ key: m[1] ?? m[3] ?? null, line: lineOf(m.index), source: 'import-meta' });
  }
  return refs.sort((a, b) => a.line - b.line);
}

/** UPPER_SNAKE object keys, e.g. the fields of a zod env schema: `DEVHUB_PORT: z.coerce.number()`. */
export function findDeclaredEnvKeys(content: string): { key: string; line: number }[] {
  const { code } = scanSource(content, 'ts');
  const lineOf = makeLineLookup(content);
  const keys: { key: string; line: number }[] = [];
  for (const m of code.matchAll(/^[ \t]*['"]?([A-Z][A-Z0-9_]{2,})['"]?\s*:/gm)) {
    const key = m[1];
    if (key !== undefined) keys.push({ key, line: lineOf(m.index) });
  }
  return keys;
}

export function parseEnvExample(content: string): Set<string> {
  const keys = new Set<string>();
  for (const m of content.matchAll(/^[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=/gm)) {
    if (m[1] !== undefined) keys.add(m[1]);
  }
  return keys;
}

export function findEnvViolations(path: string, content: string, exampleKeys: ReadonlySet<string>): Finding[] {
  if (!inEnvScope(path)) return [];
  const findings: Finding[] = [];
  const reads = findEnvReads(content);

  if (!isEnvReader(path)) {
    const configFile = CONFIG_FILES.some((r) => r.test(path));
    for (const ref of reads) {
      if (configFile && ref.key !== null && BUILTIN_ENV_KEYS.has(ref.key)) continue;
      const what = ref.source === 'process' ? 'process.env' : 'import.meta.env';
      findings.push({
        file: path,
        line: ref.line,
        rule: 'env-outside-config',
        message: `reads ${what}${ref.key === null ? '' : `.${ref.key}`} outside a config file`,
        fix: 'read it in apps/<host>/src/config.ts (validated with zod) and pass the value in as an option',
      });
    }
    return applyIgnores(ENV_GATE_ID, path, content, findings);
  }

  const seen = new Set<string>();
  const keys = [
    ...reads.flatMap((r) => (r.key === null ? [] : [{ key: r.key, line: r.line, source: r.source }])),
    ...findDeclaredEnvKeys(content).map((d) => ({ ...d, source: 'process' as const })),
  ];
  for (const { key, line, source } of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (BUILTIN_ENV_KEYS.has(key) || exampleKeys.has(key)) continue;
    if (source === 'import-meta' && VITE_ENV_KEYS.has(key)) continue;
    findings.push({
      file: path,
      line,
      rule: 'env-not-in-example',
      message: `setting "${key}" is not listed in .env.example`,
      fix: `add "${key}=" with a one-line comment to .env.example, so a new machine starts correctly`,
    });
  }
  return applyIgnores(ENV_GATE_ID, path, content, findings);
}
