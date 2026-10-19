import { builtinModules } from 'node:module';
import { makeLineLookup, type Finding } from '../gate.ts';
import { scanSource } from '../source-scan.ts';

export type PackageKey = 'contracts' | 'ui' | 'api-client' | 'app' | 'core' | 'web' | 'server' | 'desktop';

interface Layer {
  dir: string;
  /** Other @devhub packages this one may import. */
  internal: readonly PackageKey[];
  /** Runs in the browser, so no Node built-ins and no server libraries. */
  browser: boolean;
  /** When set, the only third-party packages non-test source may import. */
  externalsOnly?: readonly string[];
  /** Third-party packages this layer must never import. */
  forbidden?: readonly string[];
}

/** The "may import" column of docs/architecture.md. Keep the two in sync. */
export const LAYERS: Readonly<Record<PackageKey, Layer>> = {
  contracts: { dir: 'packages/contracts', internal: [], browser: true, externalsOnly: ['zod'] },
  ui: { dir: 'packages/ui', internal: [], browser: true },
  'api-client': { dir: 'packages/api-client', internal: ['contracts'], browser: true },
  app: { dir: 'packages/app', internal: ['contracts', 'api-client', 'ui'], browser: true },
  core: { dir: 'packages/core', internal: ['contracts'], browser: false, forbidden: ['react', 'react-dom'] },
  web: { dir: 'apps/web', internal: ['app', 'ui', 'api-client', 'contracts'], browser: true },
  server: { dir: 'apps/server', internal: ['core', 'contracts'], browser: false },
  // Starts apps/server's bundle by its path, so it imports no @devhub package (spec 027).
  desktop: { dir: 'apps/desktop', internal: [], browser: false },
};

const ARCH = 'docs/architecture.md';
const KEYS = Object.keys(LAYERS) as PackageKey[];

export function isPackageKey(value: string): value is PackageKey {
  return (KEYS as readonly string[]).includes(value);
}

/** The workspace package a repo path belongs to, or null. */
export function packageForPath(path: string): PackageKey | null {
  for (const key of KEYS) {
    if (path.startsWith(`${LAYERS[key].dir}/`)) return key;
  }
  return null;
}

/** Workspace dirs (packages/x, apps/x) that the layering table does not know. */
export function workspaceDirOf(path: string): string | null {
  const m = /^((?:packages|apps)\/[^/]+)\//.exec(path);
  return m?.[1] ?? null;
}

export function isKnownWorkspaceDir(dir: string): boolean {
  return KEYS.some((key) => LAYERS[key].dir === dir);
}

export interface ImportRef {
  specifier: string;
  line: number;
}

const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?(['"])([^'"\n]+)\1/g,
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+(['"])([^'"\n]+)\1/g,
  /\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g,
  /\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g,
];

/** Every module specifier a file imports, re-exports, dynamically imports or requires. */
export function extractImports(content: string): ImportRef[] {
  const { code } = scanSource(content, 'ts');
  const lineOf = makeLineLookup(content);
  const refs: ImportRef[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const m of code.matchAll(pattern)) {
      const specifier = m[2];
      if (specifier !== undefined) refs.push({ specifier, line: lineOf(m.index) });
    }
  }
  return refs.sort((a, b) => a.line - b.line);
}

/** The npm package a specifier names: "@scope/name", "name", "node:x"; null for relative or virtual imports. */
export function packageNameOf(specifier: string): string | null {
  if (/^(\.|\/|@\/|#|virtual:|~)/.test(specifier)) return null;
  if (specifier.startsWith('node:')) return specifier;
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) return parts.length >= 2 ? `${parts[0] ?? ''}/${parts[1] ?? ''}` : specifier;
  return parts[0] ?? specifier;
}

export function isNodeBuiltin(name: string): boolean {
  return name.startsWith('node:') || builtinModules.includes(name);
}

export function isServerOnly(name: string): boolean {
  return (
    name === 'fastify' ||
    name.startsWith('fastify-') ||
    name.startsWith('@fastify/') ||
    name === '@anthropic-ai/claude-agent-sdk' ||
    // The SDK's required peers (spec 010, Q8).
    name === '@anthropic-ai/sdk' ||
    name === '@modelcontextprotocol/sdk' ||
    name === 'simple-git' ||
    name === 'better-sqlite3' ||
    name === 'drizzle-orm' ||
    name === '@napi-rs/keyring' ||
    name === 'jira.js' ||
    name.startsWith('@octokit/') ||
    name.startsWith('@slack/') ||
    name === 'pino' ||
    name.startsWith('pino-')
  );
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || path.includes('/src/test/');
}

function allowedList(key: PackageKey): string {
  const internal = LAYERS[key].internal;
  return internal.length === 0 ? 'no other @devhub package' : internal.map((k) => `@devhub/${k}`).join(', ');
}

/** Checks one source file against the layering table. Files outside known packages are not checked here. */
export function findBoundaryViolations(path: string, content: string): Finding[] {
  const key = packageForPath(path);
  if (key === null) return [];
  const layer = LAYERS[key];
  const test = isTestFile(path);
  const findings: Finding[] = [];
  const add = (line: number, rule: string, message: string, fix: string): void => {
    findings.push({ file: path, line, rule, message, fix });
  };

  for (const { specifier, line } of extractImports(content)) {
    const name = packageNameOf(specifier);
    if (name === null) continue;

    if (name.startsWith('@devhub/')) {
      const target = name.slice('@devhub/'.length);
      if (target === key) continue;
      if (!isPackageKey(target)) {
        add(
          line,
          'unknown-package',
          `imports "${name}", which is not a workspace package`,
          `fix the import, or add the package to the table in ${ARCH} and scripts/lib/policies/boundaries.ts`,
        );
      } else if (!layer.internal.includes(target)) {
        add(
          line,
          'layering',
          `@devhub/${key} must not import ${name}`,
          `@devhub/${key} may import ${allowedList(key)} (${ARCH}, Packages). Move the shared code down a layer, usually into @devhub/contracts`,
        );
      }
      continue;
    }

    if (layer.browser) {
      if (isNodeBuiltin(name) && !test) {
        add(
          line,
          'node-in-browser',
          `browser package @devhub/${key} imports the Node built-in "${specifier}"`,
          `move this code into @devhub/core (server side), or go through the Platform interface in packages/app/src/platform.tsx`,
        );
        continue;
      }
      if (isServerOnly(name)) {
        add(
          line,
          'server-lib-in-browser',
          `browser package @devhub/${key} imports the server library "${name}"`,
          `server libraries belong in @devhub/core; the browser reaches them through an HTTP route (${ARCH})`,
        );
        continue;
      }
    }

    if (layer.forbidden?.includes(name)) {
      add(
        line,
        'layering',
        `@devhub/${key} must not import "${name}"`,
        `@devhub/${key} is server code; UI belongs in @devhub/ui or @devhub/app`,
      );
      continue;
    }

    if (layer.externalsOnly && !test && !isNodeBuiltin(name) && !layer.externalsOnly.includes(name)) {
      add(
        line,
        'contracts-deps',
        `@devhub/${key} may only import ${layer.externalsOnly.join(', ')}, not "${name}"`,
        `keep @devhub/${key} to plain zod schemas so both the browser and the server can load it`,
      );
    }
  }
  return findings;
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function dependencyNames(json: unknown): string[] {
  if (typeof json !== 'object' || json === null) return [];
  const shape = json as PackageJsonShape;
  return [
    ...Object.keys(shape.dependencies ?? {}),
    ...Object.keys(shape.devDependencies ?? {}),
    ...Object.keys(shape.peerDependencies ?? {}),
  ];
}

/** Checks a workspace package.json's @devhub/* dependencies against the same table. */
export function findPackageJsonViolations(path: string, json: unknown): Finding[] {
  const key = packageForPath(path);
  if (key === null) return [];
  const findings: Finding[] = [];
  for (const dep of dependencyNames(json)) {
    if (!dep.startsWith('@devhub/')) continue;
    const target = dep.slice('@devhub/'.length);
    if (target === key) continue;
    if (!isPackageKey(target)) {
      findings.push({
        file: path,
        line: 0,
        rule: 'unknown-package',
        message: `depends on "${dep}", which is not a workspace package`,
        fix: `remove it, or add the package to ${ARCH} and scripts/lib/policies/boundaries.ts`,
      });
    } else if (!LAYERS[key].internal.includes(target)) {
      findings.push({
        file: path,
        line: 0,
        rule: 'layering',
        message: `@devhub/${key} must not depend on ${dep}`,
        fix: `@devhub/${key} may depend on ${allowedList(key)} (${ARCH}, Packages)`,
      });
    }
  }
  return findings;
}
