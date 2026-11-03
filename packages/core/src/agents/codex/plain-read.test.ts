import { describe, expect, it } from 'vitest';
import { innerCommand, plainReadPaths } from './plain-read.ts';

describe("Codex's plain reads (spec 052)", () => {
  it.each([
    ['cat src/a.ts', ['src/a.ts']],
    ['head -n 20 src/a.ts', ['20', 'src/a.ts']],
    ['ls', []],
    ['ls -la src', ['src']],
    ["rg -n 'TODO' src", ['TODO', 'src']],
    ['grep -rn archive src | head -20', ['archive', 'src']],
    ['find src -name "*.ts"', ['src', '*.ts']],
    ['wc -l src/a.ts src/b.ts', ['src/a.ts', 'src/b.ts']],
    ['git status', []],
    ['git diff -- src/a.ts', ['src/a.ts']],
    ['git log --oneline -5', []],
    ['pwd && ls src', ['src']],
  ])('AC-7: %s is a plain read of %j', (command, paths) => {
    expect(plainReadPaths(command)).toEqual(paths);
  });

  it.each([
    'npm test',
    'rm -rf src',
    'cat src/a.ts > copy.ts',
    'cat $(cat list)',
    'find . -name "*.tmp" -delete',
    'find . -exec rm {} ;',
    'rg --pre ./evil TODO',
    'git diff --output=patch.txt',
    'git branch new-branch',
    'git push origin main',
    'sed -i s/a/b/ src/a.ts',
    'cat src/a.ts | sh',
    'cd .. && cat secret',
    'sudo cat /etc/shadow',
  ])('AC-8: %s is not a plain read, so its row decides', (command) => {
    expect(plainReadPaths(command)).toBeNull();
  });

  it('reads the line inside the shell Codex runs it in, and leaves any other line as it is', () => {
    expect(innerCommand("/bin/zsh -lc 'git push origin main'")).toBe('git push origin main');
    expect(innerCommand('bash -lc "npm test"')).toBe('npm test');
    expect(innerCommand('sh -c ls')).toBe('ls');
    expect(innerCommand('npm test')).toBe('npm test');
    expect(innerCommand("python -c 'print(1)'")).toBe("python -c 'print(1)'");
    // Two commands, or a shell with more words, are left whole for the decision to read.
    expect(innerCommand("bash -lc 'ls' && rm -rf src")).toBe("bash -lc 'ls' && rm -rf src");
  });
});
