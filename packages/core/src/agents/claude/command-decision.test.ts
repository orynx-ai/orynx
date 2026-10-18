import { describe, expect, it } from 'vitest';
import type { PermissionMode } from '@devhub/contracts';
import { decideCommand, type CommandRequest } from './command-decision.ts';

const worktree = '/Users/dev/.devhub/worktrees/0123456789abcdef';
const allowedCommands = ['npm test', 'pnpm lint'];

function decide(command: string, mode: PermissionMode = 'edit_and_run_allowed', rest: Partial<CommandRequest> = {}) {
  return decideCommand(
    { command, runInBackground: false, unsandboxed: false, ...rest },
    { mode, allowedCommands, worktree },
  );
}

const asks = (alwaysAllow: string | null = null) => ({ behavior: 'ask', alwaysAsk: null, alwaysAllow });

describe('decideCommand', () => {
  describe('in Edit files and run allowed commands', () => {
    it.each([
      'npm test',
      'npm test -- content-list',
      'npm test 2>&1 | tail -40',
      'cd packages/app && pnpm lint',
      'cd ./packages/app; pnpm lint',
      'pnpm lint | grep -c error | head -1',
      'pnpm lint | sort | uniq | wc -l',
      '/usr/local/bin/npm test',
      'npm test && pnpm lint',
    ])('AC-4, Q3: runs %j, every part on the list, a cd inside the worktree, or a filter', (command) => {
      expect(decide(command)).toEqual({ behavior: 'allow' });
    });

    it('AC-4, Q3: runs a cd to an absolute path inside the worktree', () => {
      expect(decide(`cd ${worktree}/packages/app && pnpm lint`)).toEqual({ behavior: 'allow' });
    });

    it.each([
      ['npm run lint -- --fix', 'npm run lint'],
      ['cargo test --lib', 'cargo test'],
      ['npm testing', 'npm testing'],
      ['npm', 'npm'],
      ['ls -la src', 'ls src'],
    ])('AC-5, Q4: asks about %j, which is not on the list, offering Always allow %j', (command, entry) => {
      expect(decide(command)).toEqual(asks(entry));
    });

    it.each([
      'cd /tmp && pnpm lint',
      'cd .. && pnpm lint',
      'cd ~ && pnpm lint',
      'cd $HOME && pnpm lint',
      'cd && pnpm lint',
      'npm test && npm run lint',
      'pnpm lint | grep error /etc/passwd',
      'pnpm lint | grep error ../../secret',
      'npm test | xargs rm',
    ])(
      'AC-5, Q3, Q4: asks about %j with no Always allow, because its parts are several and not all on the list',
      (command) => {
        expect(decide(command)).toEqual(asks(null));
      },
    );

    it.each(['echo $(date)', 'sudo npm test', 'npm test > out.txt', 'NODE_ENV=test npm test'])(
      'Q3: asks about %j with no Always allow, because the reader will not follow it',
      (command) => {
        expect(decide(command)).toEqual(asks(null));
      },
    );
  });

  it.each(['edit_freely_ask_commands', 'ask_everything'] as const)(
    'AC-1, AC-8, Q1: in %s every command asks, with no Always allow, even one on the list',
    (mode) => {
      expect(decide('npm test', mode)).toEqual(asks(null));
      expect(decide('ls', mode)).toEqual(asks(null));
    },
  );

  describe('whatever the mode and the list', () => {
    const modes: PermissionMode[] = ['ask_everything', 'edit_freely_ask_commands', 'edit_and_run_allowed'];

    it.each(modes)(
      'AC-6, Q3: in %s a command that reaches the network asks, saying why, with no Always allow',
      (mode) => {
        expect(decide('npm test && npm install', mode)).toEqual({
          behavior: 'ask',
          alwaysAsk: 'network',
          alwaysAllow: null,
        });
        expect(decide('curl https://x.test', mode)).toEqual({
          behavior: 'ask',
          alwaysAsk: 'network',
          alwaysAllow: null,
        });
      },
    );

    it.each(modes)('AC-6, Q3: in %s a command that deletes outside the worktree asks, saying why', (mode) => {
      expect(decide('rm -rf ~/.cache', mode)).toEqual({
        behavior: 'ask',
        alwaysAsk: 'delete_outside',
        alwaysAllow: null,
      });
    });

    it.each(modes)(
      'AC-6, Q3: in %s a command Claude wants outside the sandbox asks, saying why, even one on the list',
      (mode) => {
        expect(decide('npm test', mode, { unsandboxed: true })).toEqual({
          behavior: 'ask',
          alwaysAsk: 'unsandboxed',
          alwaysAllow: null,
        });
      },
    );

    it.each(modes)('AC-7, Q7: in %s a push or a pull request is refused without asking', (mode) => {
      for (const command of ['git push', 'git push --force origin feat/x', 'gh pr create -f', 'npm test; git push']) {
        const decision = decide(command, mode);
        expect(decision).toMatchObject({ behavior: 'refuse', reason: 'push' });
        expect(decision.behavior === 'refuse' && decision.message).toMatch(/Create pull request/);
      }
    });

    it.each(modes)('in %s a background command is refused, and told to run in the foreground', (mode) => {
      const decision = decide('npm test', mode, { runInBackground: true });
      expect(decision).toMatchObject({ behavior: 'refuse', reason: 'background' });
      expect(decision.behavior === 'refuse' && decision.message).toMatch(/foreground/);
    });

    it('says push before background, when both apply', () => {
      expect(decide('git push', 'edit_and_run_allowed', { runInBackground: true })).toMatchObject({ reason: 'push' });
    });

    it('says why it always asks before the sandbox flag, when both apply', () => {
      expect(decide('curl https://x.test', 'edit_and_run_allowed', { unsandboxed: true })).toMatchObject({
        alwaysAsk: 'network',
      });
    });
  });
});
