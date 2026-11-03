import { execFile, type ExecFileException } from 'node:child_process';
import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { lintShards, type LintShard } from './lib/lint-shards.ts';
import { repoRoot } from './lib/repo.ts';

// Usage: pnpm lint [eslint flags, e.g. --fix]
//
// Lints in shards, one ESLint process per workspace package and one for the root files.
// Typed rules hold a TypeScript program for every package a file imports, and a single
// `eslint .` holding them all outgrew the 2 GB heap Node gets on a CI runner (exit 134).
// Each shard frees its programs when it exits. Up to four run at once: a CI runner has four
// cores, and four heaps of typed programs still fit a laptop's memory.

const eslintBin = join(dirname(createRequire(import.meta.url).resolve('eslint/package.json')), 'bin', 'eslint.js');
// Each shard's output is held until it ends, so shards never print over each other; --color keeps a terminal's colours.
const extraArgs = [...(process.stdout.isTTY ? ['--color'] : []), ...process.argv.slice(2)];
const run = promisify(execFile);
const failed: string[] = [];

interface Output {
  stdout: string;
  stderr: string;
}

async function lint(shard: LintShard): Promise<void> {
  const t0 = performance.now();
  try {
    const { stdout, stderr } = await run(process.execPath, [eslintBin, ...shard.args, ...extraArgs], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    process.stdout.write(stdout + stderr);
    console.log(`✔ ${shard.name} (${String(Math.round(performance.now() - t0))} ms)`);
  } catch (error) {
    const { stdout = '', stderr = '', code, signal, message } = error as ExecFileException & Partial<Output>;
    process.stdout.write(stdout + stderr);
    const why = typeof code === 'number' ? `exit ${String(code)}` : (signal ?? message);
    console.error(`✖ ${shard.name} (${String(Math.round(performance.now() - t0))} ms, ${why})`);
    failed.push(shard.name);
  }
}

const queue = lintShards(repoRoot);
await Promise.all(
  Array.from({ length: Math.min(4, availableParallelism()) }, async () => {
    for (let shard = queue.shift(); shard !== undefined; shard = queue.shift()) await lint(shard);
  }),
);

if (failed.length > 0) {
  console.error(`✖ lint failed in ${failed.join(', ')}`);
  process.exit(1);
}
