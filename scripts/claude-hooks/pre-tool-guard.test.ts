import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide, decideBash } from './pre-tool-guard.ts';

const ROOT = '/repo';
const HOME = '/Users/dev';

const write = (file_path: string, content: string) =>
  decide({ tool_name: 'Write', tool_input: { file_path, content } }, ROOT);
const edit = (file_path: string, old_string: string, new_string: string) =>
  decide({ tool_name: 'Edit', tool_input: { file_path, old_string, new_string } }, ROOT);
const bash = (command: string, cwd = ROOT) => decideBash(command, cwd, ROOT, HOME);

describe('file tools', () => {
  it('blocks protected files with the reason', () => {
    const d = write('/repo/AGENTS.md', 'x');
    assert.equal(d.block, true);
    assert.match(d.reason, /pnpm agent-rules/);
    assert.equal(edit('/repo/packages/ui/src/styles/tokens.css', 'a', 'b').block, true);
    assert.equal(write('/repo/.env', 'TOKEN=1').block, true);
    assert.equal(write('/repo/.env.example', 'X=').block, false);
  });

  it('blocks style violations an edit adds', () => {
    const d = edit('/repo/packages/ui/src/components/button.tsx', `"p-2"`, `"p-2 bg-gray-100"`);
    assert.equal(d.block, true);
    assert.match(d.reason, /default-palette/);
  });

  it('does not blame an edit for a violation it did not add', () => {
    const old = `// style-policy-ignore-next-line: matches the design\nconst g = "grid-cols-[44px_1fr]";`;
    assert.equal(edit('/repo/packages/ui/src/components/diff.tsx', old, `${old}\nconst x = 1;`).block, false);
  });

  it('checks MultiEdit edits', () => {
    const d = decide(
      {
        tool_name: 'MultiEdit',
        tool_input: {
          file_path: '/repo/packages/app/src/a.tsx',
          edits: [{ old_string: 'a', new_string: 'dark:bg-raised' }],
        },
      },
      ROOT,
    );
    assert.equal(d.block, true);
  });

  it('blocks a new screen without a Design note', () => {
    const d = write('/repo/packages/app/src/features/home/home-screen.tsx', 'export function HomeScreen() {}');
    assert.equal(d.block, true);
    assert.match(d.reason, /design-source/);
    assert.equal(
      write('/repo/packages/app/src/features/home/home-screen.tsx', '// Design: none — placeholder\n').block,
      false,
    );
  });

  it('allows ordinary files and files outside the repo', () => {
    assert.equal(write('/repo/packages/core/src/x.ts', `const c = "#fff";`).block, false);
    assert.equal(write('/tmp/notes.md', 'AGENTS.md').block, false);
    assert.equal(decide({}, ROOT).block, false);
  });
});

describe('Bash', () => {
  it('blocks skipping hooks', () => {
    assert.equal(bash("git commit --no-verify -m 'x'").block, true);
    assert.equal(bash('git commit -n -m x').block, true);
    assert.equal(bash(`git commit -m "fix -n flag handling"`).block, false);
    assert.equal(bash('git commit --amend --no-edit').block, false);
  });

  it('blocks force pushes but not normal ones', () => {
    for (const cmd of [
      'git push --force',
      'git push -f origin x',
      'git push --force-with-lease',
      'git push origin +main',
    ]) {
      assert.equal(bash(cmd).block, true, cmd);
    }
    assert.equal(bash('git push -u origin feat/001-fix-flags').block, false);
  });

  it('blocks hard resets to the remote', () => {
    assert.equal(bash('git reset --hard origin/main').block, true);
    assert.equal(bash('git reset --hard HEAD~1').block, false);
  });

  it('blocks deleting home or ~/.devhub', () => {
    for (const cmd of [
      'rm -rf ~',
      'rm -rf ~/',
      'rm -rf ~/.devhub',
      'rm -r "$HOME"',
      'sudo rm -rf /',
      'rm -rf /Users/dev/.devhub',
    ]) {
      assert.equal(bash(cmd).block, true, cmd);
    }
    assert.equal(bash('rm -rf node_modules dist').block, false);
  });

  it('blocks shell writes to protected files, resolving paths from cwd', () => {
    for (const cmd of [
      'echo x > AGENTS.md',
      "cat >> .env <<'EOF'",
      "sed -i '' 's/a/b/' packages/ui/src/styles/tokens.css",
      'cp .env.example .env',
      'mv pnpm-lock.yaml /tmp/',
      'tee docs/product/spec.md',
    ]) {
      assert.equal(bash(cmd).block, true, cmd);
    }
    assert.equal(bash("sed -i '' 's/a/b/' src/styles/tokens.css", '/repo/packages/ui').block, true);
  });

  it('allows reading protected files and redirecting elsewhere', () => {
    for (const cmd of [
      'cat AGENTS.md',
      'git diff AGENTS.md > /tmp/out.txt',
      'pnpm test 2>&1 | tail',
      'cp AGENTS.md /tmp/x',
      'sed -n 1,5p pnpm-lock.yaml',
    ]) {
      assert.equal(bash(cmd).block, false, cmd);
    }
  });
});
