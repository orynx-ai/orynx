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
import { http, HttpResponse } from 'msw';
import {
  acceptingPulls,
  acceptingRepository,
  githubToken,
  pullsUrl,
  useFakeGitHub,
  type FakeOpenedPull,
} from '../test/fake-github.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createBranchGit } from './branch-git.ts';
import { createChangesReader } from './changes.ts';
import { openFileSessionStore, sessionsFolder } from './file-session-store.ts';
import { createPullRequests, type PullRequestReport } from './pull-requests.ts';
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
  const reports: PullRequestReport[] = [];
  const pulls = createPullRequests({
    records,
    save: (saving, update) => records.update(saving, update),
    now: () => Date.parse('2026-10-18T10:30:00.000Z'),
    onReport: (report) => reports.push(report),
    github: connection,
    client: createGitHubClient({ timeoutMs: 500 }),
    git: createBranchGit({ env }),
    changes: createChangesReader({ env }),
    adapter,
  });
  return { repos, home, worktree, records, sdk, pulls, reports };
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

/** Gives git the name and email the commit is made with, as your ~/.gitconfig would. */
async function withIdentity(root: string) {
  await writeFile(
    join(root, '.gitconfig'),
    '[init]\n\tdefaultBranch = main\n[user]\n\tname = Rakesh D\n\temail = you@company.com\n',
  );
}

const asked = { title: 'PROJ-1423: Add bulk archive to the content list', body: 'What changed.\n\nJira: PROJ-1423' };
const pullUrl = 'https://github.com/acme/web-app/pull/2841';

/** A session with Claude's change in its worktree, GitHub ready to open pull requests, and your git identity. */
async function readyToCreate(options: SetUpOptions = {}) {
  const set = await setUp(options);
  await withIdentity(set.repos.root);
  await writeFile(join(set.worktree, 'README.md'), '# web-app\n\nBulk archive.\n');
  await writeFile(join(set.worktree, 'select.ts'), 'export const select = true;\n');
  const opened: FakeOpenedPull[] = [];
  github.use(...acceptingPulls({ opened }), acceptingRepository());
  return { ...set, opened };
}

describe('creating the pull request (spec 014)', () => {
  it('AC-4, AC-5: commits, pushes the branch and opens the pull request as you left it, then saves it as PR open', async () => {
    const { repos, worktree, records, opened, pulls, reports } = await readyToCreate();
    const mainBefore = await repos.git(repos.origin, 'rev-parse', 'refs/heads/main');

    expect(await pulls.create(id, asked)).toEqual({ result: 'opened', number: 2841, url: pullUrl, linked: false });

    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/feat/PROJ-1423')).toBe(head);
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/main')).toBe(mainBefore);
    expect(await repos.git(worktree, 'log', '-1', '--format=%an <%ae>%n%B')).toBe(
      `Rakesh D <you@company.com>\n${asked.title}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`,
    );
    expect(opened).toEqual([
      { owner: 'acme', repository: 'web-app', number: 2841, head: 'feat/PROJ-1423', base: 'main', ...asked },
    ]);
    const saved = await records.get(id);
    expect(saved?.session).toMatchObject({
      state: 'pr_open',
      step: 'pull_request',
      pullRequest: { number: 2841, url: pullUrl, repository: 'acme/web-app', openedAt: '2026-10-18T10:30:00.000Z' },
    });
    expect(saved?.session.activities.at(-1)).toMatchObject({
      kind: 'pull_request',
      number: 2841,
      url: pullUrl,
      files: 2,
      branch: 'feat/PROJ-1423',
      linked: false,
    });
    expect(saved?.pushedCommit).toBe(head);
    expect(reports).toEqual([
      { what: 'pull_request', session: id, ticket: 'PROJ-1423', step: 'create', outcome: 'opened', number: 2841 },
    ]);
  });

  it('AC-5: commits nothing when Claude committed everything, and only pushes', async () => {
    const { repos, worktree, records, pulls } = await readyToCreate();
    await repos.git(worktree, 'add', '.');
    await repos.git(worktree, 'commit', '-m', 'Claude committed this');
    expect(await pulls.create(id, asked)).toMatchObject({ result: 'opened' });
    expect(await repos.git(worktree, 'log', '-1', '--format=%s')).toBe('Claude committed this');
    expect((await records.get(id))?.session.activities.at(-1)).toMatchObject({ kind: 'pull_request', files: 0 });
  });

  it('AC-11: links an open pull request GitHub already has from the branch, as it is', async () => {
    const { pulls, opened, records } = await readyToCreate();
    opened.push({
      owner: 'acme',
      repository: 'web-app',
      number: 2840,
      head: 'feat/PROJ-1423',
      base: 'main',
      title: 'Mine',
      body: '',
    });
    expect(await pulls.create(id, asked)).toEqual({
      result: 'opened',
      number: 2840,
      url: 'https://github.com/acme/web-app/pull/2840',
      linked: true,
    });
    expect(opened.map((pull) => pull.title)).toEqual(['Mine']);
    expect((await records.get(id))?.session.activities.at(-1)).toMatchObject({ kind: 'pull_request', linked: true });
  });

  it('AC-8: a new file that looks like a secret stops everything: no commit, no push, nothing saved', async () => {
    const { repos, worktree, records, pulls } = await readyToCreate();
    await writeFile(join(worktree, '.env.local'), 'TOKEN=x\n');
    const before = await records.get(id);
    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    expect(await pulls.create(id, asked)).toEqual({
      result: 'failed',
      problem: { kind: 'secret', path: '.env.local' },
    });
    expect(await repos.git(worktree, 'rev-parse', 'HEAD')).toBe(head);
    expect(await repos.git(repos.origin, 'branch', '--list', 'feat/*')).toBe('');
    expect(await records.get(id)).toEqual(before);
  });

  it('AC-8: says git has no name and email for you, and pushes nothing', async () => {
    const { repos, pulls } = await readyToCreate();
    await writeFile(join(repos.root, '.gitconfig'), '[init]\n\tdefaultBranch = main\n');
    expect(await pulls.create(id, asked)).toEqual({ result: 'failed', problem: { kind: 'no_identity' } });
    expect(await repos.git(repos.origin, 'branch', '--list', 'feat/*')).toBe('');
  });

  it('AC-9: a rejected push keeps Orynx’s commit, and the next press pushes it without making another', async () => {
    const { repos, worktree, pulls, records } = await readyToCreate();
    const other = join(repos.root, 'other');
    await repos.git(repos.root, 'clone', repos.origin, other);
    await repos.git(other, 'checkout', '-b', 'feat/PROJ-1423');
    await writeFile(join(other, 'theirs.ts'), 'theirs\n');
    await repos.git(other, 'add', '.');
    await repos.git(other, 'commit', '-m', 'Their commit');
    await repos.git(other, 'push', 'origin', 'feat/PROJ-1423');

    expect(await pulls.create(id, asked)).toEqual({ result: 'failed', problem: { kind: 'push_rejected' } });
    expect(await repos.git(worktree, 'log', '-1', '--format=%s')).toBe(asked.title);
    expect((await records.get(id))?.session.pullRequest).toBeNull();

    await repos.git(repos.origin, 'branch', '-D', 'feat/PROJ-1423');
    expect(await pulls.create(id, asked)).toMatchObject({ result: 'opened' });
    expect(await repos.git(worktree, 'log', '--format=%s', `${(await records.get(id))?.startCommit ?? ''}..HEAD`)).toBe(
      asked.title,
    );
  });

  it("AC-9: says git couldn't sign in to origin", async () => {
    const { repos, pulls } = await readyToCreate();
    const program = join(repos.root, 'fake-ssh');
    await writeFile(program, '#!/bin/sh\necho "Permission denied (publickey)." >&2\nexit 255\n', { mode: 0o755 });
    await repos.git(repos.clone, 'config', 'core.sshCommand', program);
    await repos.git(repos.clone, 'config', '--unset', `url.${repos.origin}.pushInsteadOf`);
    expect(await pulls.create(id, asked)).toEqual({ result: 'failed', problem: { kind: 'push_auth' } });
  });

  it('AC-10: GitHub refusing after the push leaves the branch pushed, and the next press opens the pull request', async () => {
    const { repos, worktree, pulls } = await readyToCreate();
    github.use(http.post(pullsUrl, () => HttpResponse.json({ message: 'Must have admin rights' }, { status: 403 })));
    expect(await pulls.create(id, asked)).toEqual({ result: 'failed', problem: { kind: 'github_forbidden' } });
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/feat/PROJ-1423')).toBe(
      await repos.git(worktree, 'rev-parse', 'HEAD'),
    );
    github.resetHandlers(...acceptingPulls(), acceptingRepository());
    expect(await pulls.create(id, asked)).toMatchObject({ result: 'opened', number: 2841 });
  });

  it.each([
    [
      'single sign-on',
      () =>
        HttpResponse.json(
          { message: 'SAML' },
          {
            status: 403,
            headers: { 'X-GitHub-SSO': 'required; url=https://github.com/orgs/acme/sso?authorization_request=A1' },
          },
        ),
      { kind: 'github_sso', url: 'https://github.com/orgs/acme/sso?authorization_request=A1' },
    ],
    [
      'the rate limit',
      () =>
        HttpResponse.json(
          { message: 'API rate limit exceeded' },
          { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1792234500' } },
        ),
      { kind: 'rate_limited', resetAt: '2026-10-17T10:55:00.000Z' },
    ],
    ['an unreachable GitHub', () => HttpResponse.error(), { kind: 'github_unreachable' }],
    [
      'nothing to merge',
      () =>
        HttpResponse.json(
          { message: 'Validation Failed', errors: [{ message: 'No commits between main and feat/PROJ-1423' }] },
          { status: 422 },
        ),
      { kind: 'no_commits' },
    ],
    [
      'any other refusal',
      () => HttpResponse.json({ message: 'Validation Failed' }, { status: 422 }),
      { kind: 'github_refused' },
    ],
    [
      'a refused token',
      () => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      { kind: 'github_refused' },
    ],
  ])('AC-10: says when GitHub refuses the pull request: %s', async (_what, answer, problem) => {
    const { pulls } = await readyToCreate();
    github.use(http.post(pullsUrl, answer));
    expect(await pulls.create(id, asked)).toEqual({ result: 'failed', problem });
  });

  it('AC-13: two presses at once make one commit, one push and one pull request', async () => {
    const { repos, worktree, records, opened, pulls } = await readyToCreate();
    const answers = await Promise.all([pulls.create(id, asked), pulls.create(id, asked)]);
    expect(answers).toEqual([
      { result: 'opened', number: 2841, url: pullUrl, linked: false },
      { result: 'opened', number: 2841, url: pullUrl, linked: false },
    ]);
    expect(opened).toHaveLength(1);
    const start = (await records.get(id))?.startCommit ?? '';
    expect(await repos.git(worktree, 'rev-list', '--count', `${start}..HEAD`)).toBe('1');
  });

  it("AC-7: says why there can't be a pull request, as the draft does", async () => {
    const { pulls } = await readyToCreate({ connected: false });
    expect(await pulls.create(id, asked)).toEqual({ result: 'cannot', reason: 'not_connected' });
    const working = await readyToCreate({ session: { state: 'working' } });
    expect(await working.pulls.create(id, asked)).toEqual({ result: 'cannot', reason: 'working' });
    expect(await pulls.create('fedcba9876543210', asked)).toBeNull();
  });
});
