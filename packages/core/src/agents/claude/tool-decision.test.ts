import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PermissionMode } from '@devhub/contracts';
import { decideToolUse, sessionTools, sessionToolsWithoutCommands } from './tool-decision.ts';

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
  // Spec 022: a file you picked, one beside it, a skill's folder and one whose name starts the same.
  await writeFile(join(outside, 'plan.pdf'), '%PDF-1.7');
  await writeFile(join(outside, 'other.pdf'), '%PDF-1.7');
  await mkdir(join(outside, 'skills', 'review'), { recursive: true });
  await mkdir(join(outside, 'skills', 'review-2'), { recursive: true });
  await writeFile(join(outside, 'skills', 'review', 'SKILL.md'), '# Review');
  await writeFile(join(outside, 'skills', 'review-2', 'SKILL.md'), '# Not this one');
  await symlink(join(outside, 'plan.pdf'), join(root, 'link-to-plan.pdf'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const decide = (
  tool: string,
  input: Record<string, unknown>,
  mode: PermissionMode = 'edit_freely_ask_commands',
  allowedCommands: readonly string[] = [],
) => decideToolUse(tool, input, { worktree, mode, home: join(root, 'home'), allowedCommands });

describe('sessionTools', () => {
  it('AC-20 (011 Q6, 012 Q2b): is exactly the tools a session gets, with commands and without', () => {
    expect(sessionTools).toEqual(['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite', 'Bash']);
    expect(sessionToolsWithoutCommands).toEqual(['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite']);
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

  it('012 AC-8, Q9: asks about an Edit inside the worktree while Ask before everything is on, with the change', async () => {
    const input = { file_path: 'src/a.ts', old_string: 'a = 1', new_string: 'a = 2' };
    expect(await decide('Edit', input, 'ask_everything')).toEqual({
      behavior: 'ask',
      ask: {
        kind: 'edit',
        path: 'src/a.ts',
        creates: false,
        lines: [
          { kind: 'removed', number: 1, text: 'export const a = 1;' },
          { kind: 'added', number: 1, text: 'export const a = 2;' },
        ],
        moreLines: 0,
      },
    });
  });

  it('012 AC-8, Q9: asks about a Write of a new file and a NotebookEdit the same way', async () => {
    expect(await decide('Write', { file_path: 'src/new.ts', content: 'x' }, 'ask_everything')).toEqual({
      behavior: 'ask',
      ask: {
        kind: 'edit',
        path: 'src/new.ts',
        creates: true,
        lines: [{ kind: 'added', number: 1, text: 'x' }],
        moreLines: 0,
      },
    });
    expect(await decide('NotebookEdit', { notebook_path: 'n.ipynb', new_source: 'x' }, 'ask_everything')).toEqual({
      behavior: 'ask',
      ask: {
        kind: 'edit',
        path: 'n.ipynb',
        creates: false,
        lines: [{ kind: 'added', number: 1, text: 'x' }],
        moreLines: 0,
      },
    });
  });

  it('AC-6: still lets Claude read and search while Ask before everything is on', async () => {
    expect(await decide('Read', { file_path: 'src/a.ts' }, 'ask_everything')).toEqual({ behavior: 'allow' });
    expect(await decide('Grep', { pattern: 'a' }, 'ask_everything')).toEqual({ behavior: 'allow' });
  });

  it('AC-6: says outside the worktree before Ask before everything, when both apply', async () => {
    expect(await decide('Write', { file_path: '/etc/x', content: 'x' }, 'ask_everything')).toMatchObject({
      refusal: { reason: 'outside_worktree' },
    });
  });

  describe('a command (012)', () => {
    const command = (input: Record<string, unknown>, mode?: PermissionMode, allowed?: readonly string[]) =>
      decide('Bash', input, mode, allowed);

    it('AC-1: asks, with the command and Claude’s own line about it', async () => {
      expect(await command({ command: 'npm test -- content-list', description: 'Run the content list tests' })).toEqual(
        {
          behavior: 'ask',
          ask: {
            kind: 'command',
            command: 'npm test -- content-list',
            description: 'Run the content list tests',
            alwaysAsk: null,
            alwaysAllow: null,
          },
        },
      );
      expect(await command({ command: 'npm test' })).toMatchObject({ ask: { description: null } });
    });

    it('AC-4, AC-5: in Edit files and run allowed commands, runs one on the list and asks about the rest with Always allow', async () => {
      expect(await command({ command: 'npm test' }, 'edit_and_run_allowed', ['npm test'])).toEqual({
        behavior: 'allow',
      });
      expect(await command({ command: 'npm run lint -- --fix' }, 'edit_and_run_allowed', ['npm test'])).toMatchObject({
        behavior: 'ask',
        ask: { alwaysAsk: null, alwaysAllow: 'npm run lint' },
      });
    });

    it('AC-6: asks about a command that always asks, saying why', async () => {
      expect(await command({ command: 'curl https://x.test' }, 'edit_and_run_allowed', ['curl'])).toMatchObject({
        ask: { alwaysAsk: 'network', alwaysAllow: null },
      });
      expect(
        await command({ command: 'npm test', dangerouslyDisableSandbox: true }, 'edit_and_run_allowed', ['npm test']),
      ).toMatchObject({
        ask: { alwaysAsk: 'unsandboxed' },
      });
    });

    it('AC-7: refuses a push without asking, as a step with the command', async () => {
      const decision = await command({ command: 'git push origin main' });
      expect(decision).toMatchObject({
        behavior: 'deny',
        refusal: { access: 'run', reason: 'push', path: 'git push origin main' },
      });
      expect(decision.behavior === 'deny' && decision.message).toMatch(/Create pull request/);
    });

    it('refuses a background command, as a step with the command', async () => {
      expect(await command({ command: 'npm start', run_in_background: true })).toMatchObject({
        behavior: 'deny',
        refusal: { access: 'run', reason: 'background', path: 'npm start' },
      });
    });

    it('refuses a call whose command it can’t read, without a step', async () => {
      expect(await command({})).toMatchObject({ behavior: 'deny', refusal: null });
      expect(await command({ command: 42 })).toMatchObject({ behavior: 'deny', refusal: null });
    });
  });

  it.each([
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

describe('files and folders the brief named (spec 022)', () => {
  const readsFor = async () => ({
    files: [await realpath(join(outside, 'plan.pdf'))],
    folders: [await realpath(join(outside, 'skills', 'review'))],
  });
  const decideWithReads = async (tool: string, input: Record<string, unknown>) =>
    decideToolUse(tool, input, {
      worktree,
      mode: 'edit_freely_ask_commands',
      home: join(root, 'home'),
      allowedCommands: [],
      reads: await readsFor(),
    });

  it('AC-15: lets Claude read a file you picked, wherever it is, by any path that leads to it', async () => {
    for (const path of [
      join(outside, 'plan.pdf'),
      join('..', '..', 'elsewhere', 'plan.pdf'),
      join(root, 'link-to-plan.pdf'),
    ]) {
      expect(await decideWithReads('Read', { file_path: path })).toEqual({ behavior: 'allow' });
    }
  });

  it('AC-15: never lets Claude change a file you picked, or read the one beside it', async () => {
    const refused = { behavior: 'deny', refusal: { reason: 'outside_worktree' } };
    expect(
      await decideWithReads('Edit', { file_path: join(outside, 'plan.pdf'), old_string: 'a', new_string: 'b' }),
    ).toMatchObject({ ...refused, refusal: { ...refused.refusal, access: 'edit' } });
    expect(await decideWithReads('Write', { file_path: join(outside, 'plan.pdf'), content: 'x' })).toMatchObject(
      refused,
    );
    expect(await decideWithReads('Read', { file_path: join(outside, 'other.pdf') })).toMatchObject(refused);
    expect(await decideWithReads('Glob', { pattern: '*', path: outside })).toMatchObject(refused);
  });

  it('AC-53: lets Claude read and search inside a skill’s folder, and nowhere that only starts the same', async () => {
    const folder = join(outside, 'skills', 'review');
    expect(await decideWithReads('Read', { file_path: join(folder, 'SKILL.md') })).toEqual({ behavior: 'allow' });
    expect(await decideWithReads('Grep', { pattern: 'Review', path: folder })).toEqual({ behavior: 'allow' });
    expect(await decideWithReads('Glob', { pattern: `${folder}/**/*.md` })).toEqual({ behavior: 'allow' });
    expect(await decideWithReads('Read', { file_path: join(outside, 'skills', 'review-2', 'SKILL.md') })).toMatchObject(
      {
        behavior: 'deny',
      },
    );
    expect(await decideWithReads('Write', { file_path: join(folder, 'SKILL.md'), content: 'x' })).toMatchObject({
      behavior: 'deny',
    });
  });

  it('without anything named, reads outside the worktree stay refused, as before', async () => {
    expect(await decide('Read', { file_path: join(outside, 'plan.pdf') })).toMatchObject({ behavior: 'deny' });
  });
});
