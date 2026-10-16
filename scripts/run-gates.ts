import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gates } from './gates/index.ts';
import { formatFinding, type Finding, type Gate, type GateContext } from './lib/gate.ts';
import { listFiles, repoRoot } from './lib/repo.ts';
import { parseRunArgs, selectGates } from './lib/run-options.ts';

// Usage: pnpm gates [--push] [--ci] [--skip-self-test] · pnpm gate <id> · pnpm gates --list

const parsed = parseRunArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`✖ ${parsed.error}`);
  process.exit(1);
}
const options = parsed.options;

if (options.list) {
  for (const gate of gates) {
    const tags = [gate.mode === 'warn' ? 'warn' : '', gate.when === 'push' ? 'push only' : '']
      .filter(Boolean)
      .join(', ');
    console.log(`${gate.id.padEnd(20)} ${gate.description}${tags ? ` (${tags})` : ''}`);
  }
  process.exit(0);
}

const selection = selectGates(gates, options);
if (!selection.ok) {
  console.error(`✖ ${selection.error}`);
  process.exit(1);
}

const started = performance.now();

// 1. The gates' own tests run first, so a broken gate can never pass quietly.
if (!options.skipSelfTest) {
  const patterns =
    options.only.length > 0
      ? [
          'scripts/lib/**/*.test.ts',
          ...options.only.map((id) => `scripts/gates/${id}.test.ts`).filter((p) => existsSync(join(repoRoot, p))),
        ]
      : ['scripts/**/*.test.ts'];
  const t0 = performance.now();
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=dot', ...patterns],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) {
    console.error('✖ gate self-tests failed — a gate is broken, so its result cannot be trusted:\n');
    console.error(`${result.stdout}${result.stderr}`);
    process.exit(1);
  }
  console.log(`✔ self-tests (${Math.round(performance.now() - t0)} ms)`);
}

// 2. The gates themselves, all at once.
let files: string[];
try {
  files = listFiles(repoRoot);
} catch (error) {
  console.error(`✖ cannot list files with git: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const cache = new Map<string, string>();
const ctx: GateContext = {
  root: repoRoot,
  files,
  read(path) {
    let text = cache.get(path);
    if (text === undefined) {
      text = readFileSync(join(repoRoot, path), 'utf8');
      cache.set(path, text);
    }
    return text;
  },
  exists: (path) => existsSync(join(repoRoot, path)),
  ci: options.ci,
  gateIds: gates.map((g) => g.id),
};

interface Outcome {
  gate: Gate;
  findings: Finding[];
  ms: number;
  error: string | null;
}

const outcomes: Outcome[] = await Promise.all(
  selection.gates.map(async (gate): Promise<Outcome> => {
    const t0 = performance.now();
    try {
      const findings = await Promise.resolve(gate.run(ctx));
      return { gate, findings, ms: Math.round(performance.now() - t0), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { gate, findings: [], ms: Math.round(performance.now() - t0), error: message };
    }
  }),
);

let failed = 0;
let warned = 0;
for (const { gate, findings, ms, error } of outcomes) {
  if (error !== null) {
    failed++;
    console.log(
      `✖ ${gate.id} could not run (${ms} ms): ${error}\n    fix: a gate that cannot do its job fails; fix the cause above`,
    );
    continue;
  }
  if (findings.length === 0) {
    console.log(`✔ ${gate.id} (${ms} ms)`);
    continue;
  }
  const isWarn = gate.mode === 'warn';
  if (isWarn) warned++;
  else failed++;
  console.log(
    `${isWarn ? '⚠' : '✖'} ${gate.id} — ${findings.length} ${isWarn ? 'warning' : 'problem'}${findings.length === 1 ? '' : 's'} (${ms} ms)`,
  );
  for (const finding of findings) console.log(formatFinding(finding));
}
for (const note of selection.skipped) console.log(`- skipped ${note}`);

const total = Math.round(performance.now() - started);
const passed = outcomes.length - failed - warned;
console.log(`\nGates: ${passed} passed, ${failed} failed, ${warned} warned in ${total} ms`);
process.exit(failed > 0 ? 1 : 0);
