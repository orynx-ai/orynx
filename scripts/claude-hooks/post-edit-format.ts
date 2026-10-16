import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot, toRepoPath } from '../lib/repo.ts';
import { isMain, parseHookInput, readStdin, type HookInput } from './hook-io.ts';

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

/** The repo file to format after this tool call, or null. */
export function formatTarget(input: HookInput, root: string): string | null {
  if (!FILE_TOOLS.has(input.tool_name ?? '')) return null;
  const file = input.tool_input?.file_path;
  if (file === undefined) return null;
  const repoPath = toRepoPath(file, root);
  return repoPath === null ? null : join(root, repoPath);
}

interface PrettierApi {
  getFileInfo(
    file: string,
    options: { ignorePath: string; resolveConfig: boolean },
  ): Promise<{ ignored: boolean; inferredParser: string | null }>;
  resolveConfig(file: string): Promise<Record<string, unknown> | null>;
  format(source: string, options: Record<string, unknown>): Promise<string>;
}

/** Formats the edited file with the repo's prettier. Silent no-op when prettier or the file is missing. */
async function main(): Promise<void> {
  const file = formatTarget(parseHookInput(await readStdin()), repoRoot);
  if (file === null || !existsSync(file)) return;
  const require = createRequire(join(repoRoot, 'package.json'));
  const mod = (await import(pathToFileURL(require.resolve('prettier')).href)) as {
    default?: PrettierApi;
  } & PrettierApi;
  const prettier: PrettierApi = mod.default ?? mod;
  const info = await prettier.getFileInfo(file, { ignorePath: join(repoRoot, '.prettierignore'), resolveConfig: true });
  if (info.ignored || info.inferredParser === null) return;
  const options = (await prettier.resolveConfig(file)) ?? {};
  const source = readFileSync(file, 'utf8');
  const formatted = await prettier.format(source, { ...options, filepath: file });
  if (formatted !== source) writeFileSync(file, formatted);
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch {
    // Formatting is a convenience; lint-staged formats again on commit.
  }
  process.exit(0);
}
