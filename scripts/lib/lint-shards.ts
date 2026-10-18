import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface LintShard {
  name: string;
  /** ESLint arguments that pick this shard's files. */
  args: string[];
}

/** The folders pnpm-workspace.yaml takes packages from. */
const WORKSPACE_DIRS = ['apps', 'packages'];

/**
 * One shard per workspace package, then one for everything else (scripts, e2e, root configs).
 * The last shard ignores exactly the packages before it, so every file is linted once and none is skipped.
 */
export function lintShards(root: string): LintShard[] {
  const workspaces = WORKSPACE_DIRS.flatMap((dir) =>
    existsSync(join(root, dir))
      ? readdirSync(join(root, dir), { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && existsSync(join(root, dir, entry.name, 'package.json')))
          .map((entry) => `${dir}/${entry.name}`)
          .sort()
      : [],
  );
  return [
    ...workspaces.map((workspace) => ({ name: workspace, args: [workspace] })),
    { name: 'root', args: ['.', ...workspaces.flatMap((workspace) => ['--ignore-pattern', `${workspace}/**`])] },
  ];
}
