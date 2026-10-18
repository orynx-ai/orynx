import { describe, expect, it } from 'vitest';
import { AllowedCommandSchema, readCommand } from './index.ts';

function messagesOf(line: string): string[] {
  const result = AllowedCommandSchema.safeParse(line);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('readCommand', () => {
  it('AC-5, Q4: reads one command into its words, and the entry Always allow saves', () => {
    expect(readCommand('npm test -- content-list')).toEqual({
      kind: 'command',
      parts: [['npm', 'test', '--', 'content-list']],
      entry: 'npm test',
    });
  });

  it('Q3: keeps quoted and escaped text as one word', () => {
    expect(readCommand(`grep "a && b" 'c | d' e\\ f src`)).toEqual({
      kind: 'command',
      parts: [['grep', 'a && b', 'c | d', 'e f', 'src']],
      entry: `grep 'a && b'`,
    });
  });

  it.each([
    [
      'npm test 2>&1 | tail -40',
      [
        ['npm', 'test', '2>&1'],
        ['tail', '-40'],
      ],
    ],
    [
      'cd packages/app && pnpm lint',
      [
        ['cd', 'packages/app'],
        ['pnpm', 'lint'],
      ],
    ],
    [
      'pnpm lint || pnpm lint --fix',
      [
        ['pnpm', 'lint'],
        ['pnpm', 'lint', '--fix'],
      ],
    ],
    [
      'pnpm build; pnpm test',
      [
        ['pnpm', 'build'],
        ['pnpm', 'test'],
      ],
    ],
    [
      'pnpm build\npnpm test',
      [
        ['pnpm', 'build'],
        ['pnpm', 'test'],
      ],
    ],
  ])('AC-4, Q3: splits %j at the operators, and offers no entry for several parts', (line, parts) => {
    expect(readCommand(line)).toEqual({ kind: 'command', parts, entry: null });
  });

  it.each([
    ['cargo test --lib', 'cargo test'],
    ['npm run lint -- --fix', 'npm run lint'],
    ['pnpm run build', 'pnpm run build'],
    ['pnpm build', 'pnpm build'],
    ['ls', 'ls'],
    ['ls -la', 'ls'],
    ['/usr/bin/make check', 'make check'],
    ['node scripts/check.js --quiet', 'node scripts/check.js'],
  ])('Q4: the entry for %j is %j', (line, entry) => {
    expect(readCommand(line)).toMatchObject({ kind: 'command', entry });
  });

  it.each([
    'ls -la src',
    'git --no-pager diff',
    'npm --silent test',
    'npm run --silent lint',
    'npm -w pkg test',
    'pnpm --filter @devhub/core test',
  ])('Q4: offers no entry for %j, where an option comes before the words the entry would hold', (line) => {
    // The entry would skip the option, so it wouldn't match this very command, or would name the wrong one.
    expect(readCommand(line)).toMatchObject({ kind: 'command', entry: null });
  });

  it.each([
    'curl https://example.com',
    'wget -q http://example.com/x',
    'ssh host ls',
    'scp a host:b',
    'sftp host',
    'rsync -a . host:x',
    'nc -l 80',
    'telnet host',
    'ftp host',
    'gh issue list',
    'git fetch origin',
    'git pull',
    'git clone x y',
    'git ls-remote',
    'git submodule update --init',
    'git -C packages/app fetch',
    'git --git-dir .git pull',
    'npm install',
    'npm i lodash',
    'npm ci',
    'pnpm add -D vitest',
    'pnpm update',
    'yarn add x',
    'yarn',
    'bun install',
    'pnpm dlx create-x',
    'npx cowsay',
    'pip install x',
    'pip3 install x',
    'brew install x',
    'apt install x',
    'apt-get install x',
    'docker pull x',
    'docker push x',
    'echo "see https://example.com"',
    'cat urls.txt | curl -K -',
    'npm test && npm install',
  ])('AC-6, Q3: %j reaches the network, so it always asks', (line) => {
    expect(readCommand(line)).toEqual({ kind: 'always_asks', reason: 'network' });
  });

  it.each([
    'rm -rf /tmp/x',
    'rm ~/x',
    'rmdir ../x',
    'unlink $FILE',
    'mv build ../out',
    'mv /etc/hosts hosts',
    'find / -name x -delete',
    'find .. -name "*.tmp" -delete',
    'pnpm build && rm -rf ~/.cache',
  ])('AC-6, Q3: %j deletes outside the worktree, so it always asks', (line) => {
    expect(readCommand(line)).toEqual({ kind: 'always_asks', reason: 'delete_outside' });
  });

  it.each(['rm -rf dist', 'rm -r node_modules/.cache', 'mv a.ts b.ts', 'find . -name "*.tmp" -delete', 'git status'])(
    'Q3: %j stays inside the worktree, so it can be allowed',
    (line) => {
      expect(readCommand(line)).toMatchObject({ kind: 'command' });
    },
  );

  it.each(['git push', 'git push --force origin feat/x', 'git -C . push', 'gh pr create -f', 'npm test; git push'])(
    'AC-7, Q7: %j pushes or opens a pull request, so it is refused',
    (line) => {
      expect(readCommand(line)).toEqual({ kind: 'push' });
    },
  );

  it.each([
    'echo $(date)',
    'echo `date`',
    'eval "$CMD"',
    'sh -c "npm test"',
    'bash -c ls',
    'sudo rm x',
    'npm test > out.txt',
    'npm test >> out.txt',
    'sort < in.txt',
    'npm test 2> err.txt',
    'npm test &> all.txt',
    'NODE_ENV=test npm test',
    'npm test &',
    '(cd src && ls)',
    'echo "unclosed',
    '',
    '   ',
  ])('Q3: %j holds something the reader will not follow, so it asks and never matches', (line) => {
    expect(readCommand(line)).toEqual({ kind: 'opaque' });
  });
});

describe('AllowedCommandSchema', () => {
  it('AC-15: takes one command, trimmed, with its words a single space apart', () => {
    expect(AllowedCommandSchema.parse('  npm   test  ')).toBe('npm test');
    expect(AllowedCommandSchema.parse('grep -n "a b"')).toBe(`grep -n 'a b'`);
  });

  it.each([
    ['', 'Enter a command.'],
    ['   ', 'Enter a command.'],
    ['npm test && npm run lint', 'Add one command at a time, without &&, ; or |.'],
    ['npm test | tail', 'Add one command at a time, without &&, ; or |.'],
    ['git push', "git push always asks, so it can't go on the list."],
    ['curl https://x.test', "curl https://x.test always asks, so it can't go on the list."],
    ['rm -rf ~/x', "rm -rf ~/x always asks, so it can't go on the list."],
    ['echo $(date)', "echo $(date) always asks, so it can't go on the list."],
  ])('AC-15, Q8f: refuses %j with its line', (line, message) => {
    expect(messagesOf(line)).toEqual([message]);
  });
});
