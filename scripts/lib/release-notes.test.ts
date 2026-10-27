import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { notesSinceLastRelease, releaseNotes } from './release-notes.ts';

describe('releaseNotes (spec 045)', () => {
  it('AC-34: lists feat under New and fix under Fixed, scope left out, and skips every other type', () => {
    assert.equal(
      releaseNotes([
        'test(core): cover delete',
        'fix(core): keep the branch on delete',
        'feat(app): show the inbox tabs',
        'docs: say how to update',
        'Merge pull request #9 from orynx-ai/ci/e2e-not-required',
        'feat!: drop Node 22',
        'chore(deps): bump zod',
      ]),
      '## New\n\n- Show the inbox tabs\n- Drop Node 22\n\n## Fixed\n\n- Keep the branch on delete\n',
    );
  });

  it('AC-35: has no notes when nothing since the last release was a feat or a fix', () => {
    assert.equal(releaseNotes(['chore: tidy', 'test(app): cover the bell', 'docs(045): plan']), '');
    assert.equal(releaseNotes([]), '');
  });

  it('keeps one section when only one has anything', () => {
    assert.equal(releaseNotes(['fix(ui): keep the focus ring']), '## Fixed\n\n- Keep the focus ring\n');
  });
});

describe('notesSinceLastRelease', () => {
  let repo: string;
  const run = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: repo,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    }).trim();
  const commit = (subject: string) => {
    writeFileSync(join(repo, 'file.txt'), subject);
    run('add', '.');
    run('commit', '-q', '-m', subject);
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'devhub-release-notes-'));
    run('init', '-q', '-b', 'main');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('AC-36: the first release lists every feat and fix on main up to that commit', () => {
    commit('feat(app): show the inbox tabs');
    commit('fix(core): keep the branch on delete');
    assert.equal(
      notesSinceLastRelease('HEAD', repo),
      '## New\n\n- Show the inbox tabs\n\n## Fixed\n\n- Keep the branch on delete\n',
    );
  });

  it('AC-34: a later release lists only what came after the last release tag', () => {
    commit('feat(app): show the inbox tabs');
    run('tag', 'v0.1.37');
    commit('fix(core): keep the branch on delete');
    run('tag', 'nightly');
    commit('test(core): cover delete');
    assert.equal(notesSinceLastRelease('HEAD', repo), '## Fixed\n\n- Keep the branch on delete\n');
  });

  it('reads the repo it is given inside a git hook, whose GIT_DIR names this one', () => {
    commit('fix(core): keep the branch on delete');
    // A pre-push hook run from a worktree has GIT_DIR set to the worktree's git dir.
    const hookGitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
    }).trim();
    process.env['GIT_DIR'] = hookGitDir;
    try {
      assert.equal(notesSinceLastRelease('HEAD', repo), '## Fixed\n\n- Keep the branch on delete\n');
    } finally {
      delete process.env['GIT_DIR'];
    }
  });
});
