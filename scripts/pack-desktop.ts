// Packs the desktop app (spec 027): builds the hub, the web app and main.cjs, stages the hub with its
// production node_modules beside the web build, then runs electron-builder with any arguments given.
//
// Usage: pnpm --filter @devhub/desktop package [--dir]   (--dir: the app folder only, no .dmg or AppImage)
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './lib/repo.ts';

const root = repoRoot;
const desktop = join(root, 'apps', 'desktop');
const stage = join(desktop, '.stage');

function run(command: string, args: string[], cwd: string): void {
  // HUSKY=0: a deploy runs the repo's prepare script, which must not install git hooks in the stage.
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, HUSKY: '0' } });
}

run(
  'pnpm',
  ['exec', 'turbo', 'run', 'build', '--filter=@devhub/server...', '--filter=@devhub/web', '--filter=@devhub/desktop'],
  root,
);

rmSync(stage, { recursive: true, force: true });
// pnpm 10 deploys a workspace package only with --legacy here; hoisted gives plain folders, no symlinks.
run(
  'pnpm',
  ['--filter', '@devhub/server', 'deploy', '--legacy', '--prod', '--config.node-linker=hoisted', join(stage, 'server')],
  root,
);
cpSync(join(root, 'apps', 'server', 'dist'), join(stage, 'server', 'dist'), { recursive: true });
for (const unused of ['src', 'node_modules/.bin', 'tsconfig.json', 'tsdown.config.ts', 'vitest.config.ts']) {
  rmSync(join(stage, 'server', unused), { recursive: true, force: true });
}
cpSync(join(root, 'apps', 'web', 'dist'), join(stage, 'web', 'dist'), { recursive: true });

run('pnpm', ['exec', 'electron-builder', '--config', 'electron-builder.yml', ...process.argv.slice(2)], desktop);
