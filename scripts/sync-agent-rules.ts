import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAgentFiles, staleAgentFiles } from './lib/agent-rules.ts';
import { repoRoot } from './lib/repo.ts';

export { renderAgentFiles };

// Usage: pnpm agent-rules           regenerate AGENTS.md, Copilot and Cursor rules from CLAUDE.md
//        pnpm agent-rules --check   exit 1 when a generated file is stale

function main(argv: readonly string[]): number {
  const check = argv.includes('--check');
  const claudeMd = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8');
  const read = (path: string): string | null => {
    const abs = join(repoRoot, path);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  };
  const stale = staleAgentFiles(claudeMd, read);
  if (check) {
    if (stale.length === 0) {
      console.log('✔ agent rule files match CLAUDE.md');
      return 0;
    }
    console.error(`✖ stale: ${stale.join(', ')}\n  fix: run \`pnpm agent-rules\``);
    return 1;
  }
  const rendered = renderAgentFiles(claudeMd);
  for (const path of stale) {
    const abs = join(repoRoot, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, rendered[path] ?? '');
    console.log(`wrote ${path}`);
  }
  if (stale.length === 0) console.log('✔ agent rule files already match CLAUDE.md');
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
