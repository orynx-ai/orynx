import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { lintShards } from './lib/lint-shards.ts';
import { repoRoot } from './lib/repo.ts';

// Usage: pnpm lint [eslint flags, e.g. --fix]
//
// Lints in shards, one ESLint process per workspace package and one for the root files.
// Typed rules hold a TypeScript program for every package a file imports, and a single
// `eslint .` holding them all outgrew the 2 GB heap Node gets on a CI runner (exit 134).
// Each shard frees its programs when it exits.

const eslintBin = join(dirname(createRequire(import.meta.url).resolve('eslint/package.json')), 'bin', 'eslint.js');
const extraArgs = process.argv.slice(2);
const failed: string[] = [];

for (const shard of lintShards(repoRoot)) {
  const t0 = performance.now();
  const result = spawnSync(process.execPath, [eslintBin, ...shard.args, ...extraArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  const took = `${Math.round(performance.now() - t0)} ms`;
  if (result.status === 0) {
    console.log(`✔ ${shard.name} (${took})`);
  } else {
    const why = result.error?.message ?? result.signal ?? `exit ${String(result.status)}`;
    console.error(`✖ ${shard.name} (${took}, ${why})`);
    failed.push(shard.name);
  }
}

if (failed.length > 0) {
  console.error(`✖ lint failed in ${failed.join(', ')}`);
  process.exit(1);
}
