import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@devhub/contracts';
import { makeSession, makeSessionPullRequest } from '@devhub/contracts/testing';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createClaudeAdapter } from '../agents/claude/claude-adapter.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createGitHubClient } from '../integrations/github/client.ts';
import { createGitHubConnection } from '../integrations/github/connection.ts';
import { createGhCli } from '../integrations/github/gh.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { fakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { acceptingPulls, acceptingRepository, githubToken, useFakeGitHub } from '../test/fake-github.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createBranchGit } from './branch-git.ts';
import { createChangesReader } from './changes.ts';
import { openFileSessionStore, sessionsFolder } from './file-session-store.ts';
import { createPullRequests } from './pull-requests.ts';
import type { StoredSession } from './session-store.ts';
import { createWorktrees } from './worktrees.ts';

// Each test makes real repositories and a worktree with git, which can pass 5 seconds when every file runs at once.
vi.setConfig({ testTimeout: 20_000 });

const github = useFakeGitHub();
const repositories = useTestRepositories();
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const id = '0123456789abcdef';
const jiraUrl = 'https://your-team.atlassian.net/browse/PROJ-1423';
const brief =
  'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list\n\nContent managers archive one by one.';
const claudeDraft = 'Add bulk archive to the content list\n\n## What changed\n\nRow selection and Archive selected.';

interface SetUpOptions {
  /** What Claude answers for the draft. */
  draft?: readonly FakeTurn[];
  /** GitHub connected the token way, or not at all. */
  connected?: boolean;
  /** Build it without Claude Code. */
  noClaude?: boolean;
  /** Changes to the session as saved. */
  session?: Partial<Session>;
  /** The base the worktree step names. */
  base?: string;
}

async function setUp({
  draft = [{ finish: claudeDraft }],
  connected = true,
  noClaude = false,
  session = {},
  base = 'origin/main',
}: SetUpOptions = {}) {
  const repos = await repositories();
  const home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-pull-requests-')));
  homes.push(home);
  const env = gitEnvironment(repos.env);
  const worktree = join(repos.worktrees, id);
  const made = await createWorktrees({ env, root: repos.worktrees }).make(repos.clone, worktree, {
    branch: 'feat/PROJ-1423',
    base: 'origin/main',
    remote: true,
  });
  if (!made.ok) throw new Error('the worktree should be made');
  // origin reads as github.com, and a push goes to the bare repository standing in for it.
  await repos.git(repos.clone, 'remote', 'set-url', 'origin', 'git@github.com:acme/web-app.git');
  await repos.git(repos.clone, 'config', `url.${repos.origin}.pushInsteadOf`, 'git@github.com:acme/web-app.git');

  const records = await openFileSessionStore(home);
  const record: StoredSession = {
    session: makeSession({
      id,
      title: 'Add bulk archive to the content list',
      state: 'done',
      step: 'review',
      branch: 'feat/PROJ-1423',
      jiraUrl,
      activities: [
        { id: 'step-1', state: 'done', kind: 'worktree', branch: 'feat/PROJ-1423', base, fetched: true },
        { id: 'step-2', state: 'done', kind: 'brief', key: 'PROJ-1423' },
        { id: 'step-3', state: 'done', kind: 'edit', files: ['README.md'] },
        { id: 'step-4', state: 'done', kind: 'finished', summary: 'Added row selection. `npm test` passes.' },
      ],
      ...session,
    }),
    repository: { id: '00000000000000aa', path: repos.clone },
    worktree,
    startCommit: made.startCommit,
    claudeSessionId: 'b2c7e0f4-0000-4000-8000-000000000001',
    pushedCommit: null,
    approvalLog: [],
  };
  await records.create(record);
  await records.writeBrief(id, brief);

  const events = createEventBus();
  const connection = createGitHubConnection({
    settings: createMemorySettingsStore(connected ? { github: { method: 'token' } } : {}),
    tokens: createTokenStore({ keychain: createMemoryKeychain({ github: githubToken }), events }),
    github: createGitHubClient({ timeoutMs: 500 }),
    gh: createGhCli({ searchPath: '' }),
    events,
    envToken: false,
  });
  const sdk = fakeClaudeSdk(draft);
  const adapter = noClaude
    ? null
    : createClaudeAdapter({ query: sdk.query, program: '/opt/claude/claude', env: {}, home: repos.root });
  const pulls = createPullRequests({
    records,
    github: connection,
    client: createGitHubClient({ timeoutMs: 500 }),
    git: createBranchGit({ env }),
    changes: createChangesReader({ env }),
    adapter,
  });
  return { repos, home, worktree, records, sdk, pulls };
}

const hashOf = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

describe('drafting the pull request (spec 014)', () => {
  it("AC-2, AC-3: gives Claude's draft with the key and the Jira line, and what will happen", async () => {
    const { worktree, sdk, pulls } = await setUp();
    await writeFile(join(worktree, 'README.md'), '# web-app\n\nBulk archive.\n');
    await writeFile(join(worktree, 'select.ts'), 'export const select = true;\n');

    expect(await pulls.draft(id)).toEqual({
      result: 'draft',
      title: 'PROJ-1423: Add bulk archive to the content list',
      body: `## What changed\n\nRow selection and Archive selected.\n\nJira: [PROJ-1423](${jiraUrl})`,
      byClaude: true,
      files: 2,
      branch: 'feat/PROJ-1423',
      repository: 'acme/web-app',
      base: 'main',
    });
    expect(sdk.runs).toHaveLength(1);
  });

  it('AC-15: Claude gets exactly the ticket as sent, its summary, the files, the diff and the base, with no tools', async () => {
    const { worktree, sdk, pulls } = await setUp();
    await writeFile(join(worktree, 'README.md'), '# web-app\n\nBulk archive.\n');
    await mkdir(join(worktree, '.github'));
    await writeFile(join(worktree, '.github', 'pull_request_template.md'), '## Summary\n\n## Testing\n');
    await pulls.draft(id);

    const [run] = sdk.runs;
    expect(run?.options.tools).toEqual([]);
    const [prompt = ''] = run?.prompts ?? [];
    expect(prompt).toContain('Content managers archive one by one.');
    expect(prompt).toContain('Added row selection. `npm test` passes.');
    expect(prompt).toContain('- README.md +2 −0');
    expect(prompt).toContain('+Bulk archive.');
    expect(prompt).toContain('## Summary\n\n## Testing');
    expect(prompt).toContain('Recent commit subjects on main');
    expect(prompt).toContain('- first');
  });

  it("AC-6: starts from the ticket and Claude's summary when Claude can't draft, or there's no Claude Code", async () => {
    const fallback = {
      result: 'draft',
      title: 'PROJ-1423: Add bulk archive to the content list',
      body: `Added row selection. \`npm test\` passes.\n\nJira: [PROJ-1423](${jiraUrl})`,
      byClaude: false,
    };
    const signedOut = await setUp({
      draft: [{ message: { type: 'assistant', error: 'authentication_failed', message: { content: [] } } }],
    });
    await writeFile(join(signedOut.worktree, 'README.md'), 'changed\n');
    expect(await signedOut.pulls.draft(id)).toMatchObject(fallback);

    const noClaude = await setUp({ noClaude: true });
    await writeFile(join(noClaude.worktree, 'README.md'), 'changed\n');
    expect(await noClaude.pulls.draft(id)).toMatchObject(fallback);
  });

  it('AC-6: an empty answer from Claude starts from the ticket too', async () => {
    const { worktree, pulls } = await setUp({ draft: [{ finish: '  \n' }] });
    await writeFile(join(worktree, 'README.md'), 'changed\n');
    expect(await pulls.draft(id)).toMatchObject({ byClaude: false });
  });

  it("names GitHub's default branch as the base when the session's base wasn't on origin", async () => {
    const { worktree, pulls } = await setUp({ base: 'main' });
    github.use(acceptingRepository({ defaultBranch: 'trunk' }));
    await writeFile(join(worktree, 'README.md'), 'changed\n');
    expect(await pulls.draft(id)).toMatchObject({ base: 'trunk' });
  });

  it("AC-7: says why there can't be a pull request, without asking Claude", async () => {
    const cases: {
      name: string;
      options?: SetUpOptions;
      before?: (s: Awaited<ReturnType<typeof setUp>>) => Promise<unknown>;
      reason: string;
    }[] = [
      { name: 'GitHub not connected', options: { connected: false }, reason: 'not_connected' },
      {
        name: 'no origin',
        before: (s) => s.repos.git(s.repos.clone, 'remote', 'remove', 'origin'),
        reason: 'no_origin',
      },
      {
        name: 'origin elsewhere',
        before: (s) => s.repos.git(s.repos.clone, 'remote', 'set-url', 'origin', 'https://gitlab.com/acme/web-app.git'),
        reason: 'not_github',
      },
      { name: 'no changes', reason: 'no_changes' },
      { name: 'worktree gone', before: (s) => rm(s.worktree, { recursive: true, force: true }), reason: 'missing' },
      { name: 'Claude working', options: { session: { state: 'working' } }, reason: 'working' },
      {
        name: 'discarded',
        options: { session: { state: 'stopped', discardedAt: '2026-10-18T10:00:00.000Z' } },
        reason: 'discarded',
      },
      {
        name: 'a PR open',
        options: { session: { state: 'pr_open', pullRequest: makeSessionPullRequest() } },
        reason: 'opened',
      },
      { name: 'no worktree made', options: { session: { branch: null } }, reason: 'no_worktree' },
    ];
    for (const { name, options, before, reason } of cases) {
      const set = await setUp(options);
      if (reason !== 'no_changes') await writeFile(join(set.worktree, 'README.md'), 'changed\n').catch(() => undefined);
      await before?.(set);
      expect(await set.pulls.draft(id), name).toEqual({ result: 'cannot', reason });
      expect(set.sdk.runs, name).toHaveLength(0);
    }
  });

  it("AC-14: changes nothing: not the session, not the worktree's index, not origin", async () => {
    const { repos, home, worktree, pulls } = await setUp();
    github.use(...acceptingPulls());
    await writeFile(join(worktree, 'README.md'), 'changed\n');
    const saved = join(sessionsFolder(home), id, 'session.json');
    const index = join(repos.clone, '.git', 'worktrees', id, 'index');
    const status = await repos.git(worktree, 'status', '--porcelain');
    const [session, indexBefore] = [await hashOf(saved), await hashOf(index)];

    await pulls.draft(id);
    expect(await hashOf(saved)).toBe(session);
    expect(await hashOf(index)).toBe(indexBefore);
    expect(await repos.git(worktree, 'status', '--porcelain')).toBe(status);
    expect(await repos.git(repos.origin, 'branch', '--list', 'feat/*')).toBe('');
  });

  it('answers null for a session it doesn’t have', async () => {
    const { pulls } = await setUp();
    expect(await pulls.draft('fedcba9876543210')).toBeNull();
  });
});
