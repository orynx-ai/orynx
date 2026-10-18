import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PermissionMode } from '@devhub/contracts';
import { decideToolUse, sessionTools } from './tool-decision.ts';

let root: string;
let worktree: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'devhub-tool-decision-'));
  worktree = join(root, 'worktrees', '0123456789abcdef');
  outside = join(root, 'elsewhere');
  await mkdir(join(worktree, 'src'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(worktree, 'src', 'a.ts'), 'export const a = 1;\n');
  await writeFile(join(worktree, '.git'), 'gitdir: /somewhere/.git/worktrees/0123456789abcdef\n');
  await writeFile(join(outside, 'secret.txt'), 'not for Claude\n');
  // A repository can hold symlinks that point anywhere.
  await symlink(join(outside, 'secret.txt'), join(worktree, 'src', 'link-to-secret.txt'));
  await symlink(outside, join(worktree, 'linked-folder'));
  // A symlink to a file that doesn't exist yet: writing to it would create that file outside.
  await symlink(join(outside, 'not-yet.txt'), join(worktree, 'src', 'dangling.txt'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const decide = (tool: string, input: Record<string, unknown>, mode: PermissionMode = 'edit_freely_ask_commands') =>
  decideToolUse(tool, input, { worktree, mode, home: join(root, 'home') });

describe('sessionTools', () => {
  it('AC-20 (Q6): is exactly the tools a session gets before approvals', () => {
    expect(sessionTools).toEqual(['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite']);
  });
});

describe('decideToolUse', () => {
  it.each([
    ['Read', { file_path: 'src/a.ts' }],
    ['Glob', { pattern: '**/*.ts' }],
    ['Glob', { pattern: '*.ts', path: 'src' }],
    ['Grep', { pattern: 'export' }],
    ['Grep', { pattern: 'export', path: 'src' }],
    ['TodoWrite', { todos: [] }],
  ] as const)('AC-4: lets %s %j through inside the worktree', async (tool, input) => {
    expect(await decide(tool, input)).toEqual({ behavior: 'allow' });
  });

  it.each([
    ['Edit', { file_path: join('src', 'a.ts'), old_string: '1', new_string: '2' }],
    ['Write', { file_path: 'src/new-file.ts', content: 'x' }],
    ['Write', { file_path: 'src/deep/new/folder/file.ts', content: 'x' }],
    ['NotebookEdit', { notebook_path: 'analysis.ipynb', new_source: 'x' }],
  ] as const)('AC-4: lets %s change a file inside the worktree, even one that is new', async (tool, input) => {
    expect(await decide(tool, input)).toEqual({ behavior: 'allow' });
  });

  it('AC-4: takes an absolute path inside the worktree', async () => {
    expect(await decide('Read', { file_path: join(worktree, 'src', 'a.ts') })).toEqual({ behavior: 'allow' });
  });

  it.each([
    ['Read', { file_path: '/etc/hosts' }, 'read', '/etc/hosts'],
    ['Read', { file_path: '../../elsewhere/secret.txt' }, 'read', 'ELSEWHERE/secret.txt'],
    ['Glob', { pattern: '*', path: '/' }, 'read', '/'],
    ['Glob', { pattern: '/etc/*.conf' }, 'read', '/etc'],
    ['Glob', { pattern: '../../**/*' }, 'read', 'ROOT'],
    ['Grep', { pattern: 'token', path: '~/.ssh' }, 'read', 'HOME/.ssh'],
    ['Edit', { file_path: '/etc/hosts', old_string: 'a', new_string: 'b' }, 'edit', '/etc/hosts'],
    ['Write', { file_path: '../../elsewhere/new.txt', content: 'x' }, 'edit', 'ELSEWHERE/new.txt'],
  ] as const)('AC-5: refuses %s %j outside the worktree', async (tool, input, access, shown) => {
    const path = shown.replace('ELSEWHERE', outside).replace('ROOT', join(root)).replace('HOME', join(root, 'home'));
    const decision = await decide(tool, input);
    expect(decision).toMatchObject({ behavior: 'deny', refusal: { access, reason: 'outside_worktree', path } });
    expect(decision.behavior === 'deny' && decision.message).toMatch(/only inside the worktree/);
  });

  it('AC-5: follows a symlink in the repository and refuses what it points to outside', async () => {
    expect(await decide('Read', { file_path: 'src/link-to-secret.txt' })).toMatchObject({
      behavior: 'deny',
      refusal: { access: 'read', reason: 'outside_worktree', path: 'src/link-to-secret.txt' },
    });
    expect(await decide('Write', { file_path: 'linked-folder/planted.txt', content: 'x' })).toMatchObject({
      behavior: 'deny',
      refusal: { access: 'edit', reason: 'outside_worktree', path: 'linked-folder/planted.txt' },
    });
    expect(await decide('Grep', { pattern: 'x', path: 'linked-folder' })).toMatchObject({ behavior: 'deny' });
  });

  it('AC-5: refuses a write through a symlink whose target doesn’t exist yet', async () => {
    expect(await decide('Write', { file_path: 'src/dangling.txt', content: 'x' })).toMatchObject({
      behavior: 'deny',
      refusal: { access: 'edit', reason: 'outside_worktree', path: 'src/dangling.txt' },
    });
  });

  it('AC-5: keeps Claude out of the worktree’s .git, which points git at the repository', async () => {
    for (const [tool, input] of [
      ['Read', { file_path: '.git' }],
      ['Write', { file_path: '.git', content: 'gitdir: /tmp/evil' }],
      ['Edit', { file_path: join(worktree, '.git'), old_string: 'a', new_string: 'b' }],
    ] as const) {
      expect(await decide(tool, input)).toMatchObject({
        behavior: 'deny',
        refusal: { reason: 'outside_worktree', path: '.git' },
      });
    }
  });

  it.each(['Edit', 'Write', 'NotebookEdit'])(
    'AC-6: refuses %s inside the worktree while Ask before everything is on',
    async (tool) => {
      const input = tool === 'NotebookEdit' ? { notebook_path: 'n.ipynb', new_source: 'x' } : { file_path: 'src/a.ts' };
      const decision = await decide(tool, input, 'ask_everything');
      expect(decision).toMatchObject({
        behavior: 'deny',
        refusal: { access: 'edit', reason: 'ask_everything', path: tool === 'NotebookEdit' ? 'n.ipynb' : 'src/a.ts' },
      });
      expect(decision.behavior === 'deny' && decision.message).toMatch(/Ask before everything/);
    },
  );

  it('AC-6: still lets Claude read and search while Ask before everything is on', async () => {
    expect(await decide('Read', { file_path: 'src/a.ts' }, 'ask_everything')).toEqual({ behavior: 'allow' });
    expect(await decide('Grep', { pattern: 'a' }, 'ask_everything')).toEqual({ behavior: 'allow' });
  });

  it('AC-6: says outside the worktree before Ask before everything, when both apply', async () => {
    expect(await decide('Write', { file_path: '/etc/x', content: 'x' }, 'ask_everything')).toMatchObject({
      refusal: { reason: 'outside_worktree' },
    });
  });

  it.each([
    ['Bash', { command: 'npm test' }],
    ['WebFetch', { url: 'https://example.com', prompt: 'x' }],
    ['WebSearch', { query: 'x' }],
    ['Agent', { prompt: 'x', description: 'x' }],
    ['AskUserQuestion', { questions: [] }],
    ['mcp__github__create_pull_request', { title: 'x' }],
  ] as const)('AC-5 (Q6): refuses %s, which a session doesn’t have, without a step', async (tool, input) => {
    const decision = await decide(tool, input);
    expect(decision).toMatchObject({ behavior: 'deny', refusal: null });
  });

  it('refuses a call whose path it can’t read', async () => {
    expect(await decide('Read', {})).toMatchObject({ behavior: 'deny', refusal: null });
    expect(await decide('Edit', { file_path: 42 })).toMatchObject({ behavior: 'deny', refusal: null });
  });
});
