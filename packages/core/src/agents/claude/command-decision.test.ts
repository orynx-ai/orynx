import { describe, expect, it } from 'vitest';
import { defaultPermissions, type Permissions } from '@devhub/contracts';
import { decideCommand, type CommandContext, type CommandRequest } from './command-decision.ts';

const worktree = '/Users/dev/.devhub/worktrees/0123456789abcdef';
const branch = 'feat/PROJ-1423';
const allowedCommands = ['npm test', 'pnpm lint'];

function context(rows: Partial<Permissions> = {}, list: readonly string[] = allowedCommands): CommandContext {
  return { ...defaultPermissions, ...rows, allowedCommands: list, worktree, branch };
}

function decide(
  command: string,
  commands: Permissions['commands'] = 'allowed_list',
  rest: Partial<CommandRequest> = {},
  rows: Partial<Permissions> = {},
) {
  return decideCommand(
    { command, runInBackground: false, unsandboxed: false, ...rest },
    context({ commands, ...rows }),
  );
}

/** With Only allowed commands, and this allow list. */
function decideWith(command: string, list: readonly string[]) {
  return decideCommand(
    { command, runInBackground: false, unsandboxed: false },
    context({ commands: 'allowed_list' }, list),
  );
}

const runs = { behavior: 'allow', outsideSandbox: false };
const runsOutside = { behavior: 'allow', outsideSandbox: true };
const asks = (alwaysAllow: string | null = null) => ({ behavior: 'ask', alwaysAsk: null, alwaysAllow });
const asksBecause = (alwaysAsk: string) => ({ behavior: 'ask', alwaysAsk, alwaysAllow: null });

describe('decideCommand', () => {
  describe('with Run commands: Only allowed commands', () => {
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
      expect(decide(command)).toEqual(runs);
    });

    it('AC-4, Q3: runs a cd to an absolute path inside the worktree', () => {
      expect(decide(`cd ${worktree}/packages/app && pnpm lint`)).toEqual(runs);
    });

    it.each([
      ['npm run lint -- --fix', 'npm run lint'],
      ['cargo test --lib', 'cargo test'],
      ['npm testing', 'npm testing'],
      ['npm', 'npm'],
      ['ls -la', 'ls'],
    ])('AC-5, Q4: asks about %j, which is not on the list, offering Always allow %j', (command, entry) => {
      expect(decide(command)).toEqual(asks(entry));
    });

    it.each([
      'npm run lint -- --fix',
      'cargo test --lib',
      'ls -la',
      'npm test -- content-list',
      '/usr/bin/make check',
      'node scripts/check.js --quiet',
    ])('AC-5, Q4: once Always allow has saved its entry, %j runs without asking', (command) => {
      const offered = decideWith(command, []);
      const entry = offered.behavior === 'ask' ? offered.alwaysAllow : null;
      expect(entry).not.toBeNull();
      expect(decideWith(command, [entry ?? ''])).toEqual(runs);
    });

    it.each(['ls -la src', 'git --no-pager diff', 'npm --silent test', 'npm run --silent lint', 'npm -w pkg test'])(
      'AC-5, Q4: asks about %j with no Always allow, because an option before its words would keep the entry from matching',
      (command) => {
        expect(decideWith(command, [])).toEqual(asks(null));
      },
    );

    it.each([
      ['npm run test', 'npm test'],
      ['npm testing', 'npm test'],
      ['git -C ../other diff', 'git diff'],
      ['git --git-dir .. diff', 'git diff'],
    ])('AC-5, Q4: %j does not run on the entry %j, whose words it does not start with', (command, entry) => {
      expect(decideWith(command, [entry])).toMatchObject({ behavior: 'ask' });
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

  it('AC-1, AC-8, Q1: with Run commands: Ask first, every command asks, with no Always allow, even one on the list', () => {
    expect(decide('npm test', 'ask')).toEqual(asks(null));
    expect(decide('ls', 'ask')).toEqual(asks(null));
  });

  it.each(['npm test', 'make build', 'npm test > out.txt', 'echo $(date)', 'cd /tmp && ls'])(
    'spec 026: with Run commands: Any command, %j runs in the sandbox without asking',
    (command) => {
      expect(decide(command, 'any')).toEqual(runs);
    },
  );

  describe('the network, delete and sandbox rows', () => {
    const lists = ['ask', 'allowed_list', 'any'] as const;

    it.each(lists)('AC-6, Q3: with commands %s, a command that reaches the network asks, saying why', (commands) => {
      expect(decide('npm test && npm install', commands)).toEqual(asksBecause('network'));
      expect(decide('curl https://x.test', commands)).toEqual(asksBecause('network'));
    });

    it.each(lists)('AC-6, Q3: with commands %s, a command that deletes outside the worktree asks', (commands) => {
      expect(decide('rm -rf ~/.cache', commands)).toEqual(asksBecause('delete_outside'));
    });

    it.each(lists)('AC-6, Q3: with commands %s, a command Claude wants outside the sandbox asks', (commands) => {
      expect(decide('npm test', commands, { unsandboxed: true })).toEqual(asksBecause('unsandboxed'));
    });

    it.each(lists)(
      'spec 026: with commands %s, Allow on the network and delete rows runs those commands outside the sandbox',
      (commands) => {
        expect(decide('curl https://x.test', commands, {}, { network: 'allow' })).toEqual(runsOutside);
        expect(decide('rm -rf ~/.cache', commands, {}, { deleteOutside: 'allow' })).toEqual(runsOutside);
        // Each row decides only its own kind.
        expect(decide('rm -rf ~/.cache', commands, {}, { network: 'allow' })).toEqual(asksBecause('delete_outside'));
      },
    );

    it('spec 026: Allow outside the sandbox lets the commands row decide, and what it runs leaves the sandbox', () => {
      const rows = { unsandboxed: 'allow' } as const;
      expect(decide('npm test', 'allowed_list', { unsandboxed: true }, rows)).toEqual(runsOutside);
      expect(decide('make build', 'any', { unsandboxed: true }, rows)).toEqual(runsOutside);
      expect(decide('make build', 'allowed_list', { unsandboxed: true }, rows)).toEqual(asks('make build'));
      expect(decide('npm test', 'ask', { unsandboxed: true }, rows)).toEqual(asks(null));
    });

    it('spec 026: a line Orynx cannot read never leaves the sandbox without asking, even with every row on Allow', () => {
      const rows = { unsandboxed: 'allow', network: 'allow' } as const;
      expect(decide('echo $(date)', 'any', { unsandboxed: true }, rows)).toEqual(asksBecause('unsandboxed'));
    });

    it('in every row a background command is refused, and told to run in the foreground or use start_server (spec 042, AC-14)', () => {
      for (const commands of lists) {
        const decision = decide('npm test', commands, { runInBackground: true });
        expect(decision).toMatchObject({ behavior: 'refuse', reason: 'background' });
        expect(decision.behavior === 'refuse' && decision.message).toMatch(/foreground/);
        expect(decision.behavior === 'refuse' && decision.message).toMatch(/start_server/);
      }
    });

    it('says why it always asks before the sandbox flag, when both apply', () => {
      expect(decide('curl https://x.test', 'allowed_list', { unsandboxed: true })).toMatchObject({
        alwaysAsk: 'network',
      });
    });
  });

  describe('a push or a pull request (spec 026)', () => {
    const push = `git push origin ${branch}`;
    const pull = 'gh pr create --fill';

    it('AC-7, Q7: with Never, the default, both are refused without asking, and Claude is told where the switch is', () => {
      for (const command of [push, pull, 'git push', 'npm test; git push']) {
        const decision = decide(command, 'any');
        expect(decision).toMatchObject({ behavior: 'refuse', reason: 'push' });
        expect(decision.behavior === 'refuse' && decision.message).toMatch(/off in Settings › Coding agent/);
      }
    });

    it('with Ask first, each asks with Allow once and Deny only, saying why', () => {
      expect(decide(push, 'ask', {}, { push: 'ask' })).toEqual(asksBecause('push'));
      expect(decide(pull, 'ask', {}, { pullRequest: 'ask' })).toEqual(asksBecause('pull_request'));
    });

    it('with Allow, each runs outside the sandbox, as it needs the network', () => {
      expect(decide(push, 'ask', {}, { push: 'allow' })).toEqual(runsOutside);
      expect(decide(`git push -u origin ${branch}`, 'ask', {}, { push: 'allow' })).toEqual(runsOutside);
      expect(decide(pull, 'ask', {}, { pullRequest: 'allow' })).toEqual(runsOutside);
      expect(decide(`gh pr create --head ${branch} --title x`, 'ask', {}, { pullRequest: 'allow' })).toEqual(
        runsOutside,
      );
      expect(decide(`gh pr create --head=${branch}`, 'ask', {}, { pullRequest: 'allow' })).toEqual(runsOutside);
    });

    it.each([
      'git push',
      'git push origin',
      `git push --force origin ${branch}`,
      `git push -f origin ${branch}`,
      `git push --force-with-lease origin ${branch}`,
      `git push origin +${branch}`,
      'git push origin main',
      `git push origin ${branch}:main`,
      `git push origin :${branch}`,
      `git push upstream ${branch}`,
      `git push --tags origin ${branch}`,
      `git -C ../other push origin ${branch}`,
      `npm test && git push origin ${branch}`,
    ])('refuses %j even with Allow: only the session branch, on its own and unforced', (command) => {
      const decision = decide(command, 'any', {}, { push: 'allow' });
      expect(decision).toMatchObject({ behavior: 'refuse', reason: 'push' });
      expect(decision.behavior === 'refuse' && decision.message).toContain(`git push origin ${branch}`);
    });

    it.each(['gh pr create --repo acme/other', 'gh pr create -R acme/other', 'gh pr create --head main'])(
      'refuses %j even with Allow: only this session branch’s pull request',
      (command) => {
        expect(decide(command, 'any', {}, { pullRequest: 'allow' })).toMatchObject({
          behavior: 'refuse',
          reason: 'push',
        });
      },
    );

    it('spec 031: on your pull request’s detached worktree, only HEAD goes to its branch, as its row says', () => {
      const detached = (command: string, rows: Partial<Permissions>) =>
        decideCommand({ command, runInBackground: false, unsandboxed: false }, { ...context(rows), detached: true });
      const head = `git push origin HEAD:${branch}`;
      expect(detached(head, { push: 'allow' })).toEqual(runsOutside);
      expect(detached(head, { push: 'ask' })).toEqual(asksBecause('push'));
      expect(detached(head, {})).toMatchObject({ behavior: 'refuse', reason: 'push' });
      // A local branch of that name is your main checkout's, so naming it would push the wrong commits.
      for (const command of [push, `git push origin +HEAD:${branch}`, 'git push origin HEAD:main']) {
        const decision = detached(command, { push: 'allow' });
        expect(decision).toMatchObject({ behavior: 'refuse', reason: 'push' });
        expect(decision.behavior === 'refuse' && decision.message).toContain(head);
      }
      // Without a detached worktree, HEAD:<branch> isn't the line Claude was given.
      expect(decide(head, 'any', {}, { push: 'allow' })).toMatchObject({ behavior: 'refuse', reason: 'push' });
    });

    it('refuses a push before the session has a branch', () => {
      const decision = decideCommand(
        { command: push, runInBackground: false, unsandboxed: false },
        { ...context({ push: 'allow' }), branch: null },
      );
      expect(decision).toMatchObject({ behavior: 'refuse', reason: 'push' });
    });

    it('says push before background when pushing is off, and background when it is allowed', () => {
      expect(decide('git push', 'any', { runInBackground: true })).toMatchObject({ reason: 'push' });
      expect(decide(push, 'any', { runInBackground: true }, { push: 'allow' })).toMatchObject({
        reason: 'background',
      });
    });
  });
});
