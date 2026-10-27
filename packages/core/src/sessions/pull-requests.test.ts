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
  acceptingReviewThreads,
  githubLogin,
  githubToken,
  graphqlUrl,
  pullsUrl,
  useFakeGitHub,
  type FakeOpenedPull,
  type FakePullContext,
  type FakeThreadWrite,
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
        {
          id: 'step-2',
          state: 'done',
          kind: 'brief',
          key: 'PROJ-1423',
          tickets: [],
          message: false,
          pullRequests: [],
          files: [],
          skills: [],
        },
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
    commandLog: [],
    commandsDropped: 0,
  };
  await records.create(record);
  await records.writeBrief(id, brief);

  const events = createEventBus();
  const settings = createMemorySettingsStore(connected ? { github: { method: 'token' } } : {});
  const connection = createGitHubConnection({
    settings,
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
  return { repos, home, worktree, records, sdk, pulls, reports, settings };
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

  it('015 AC-34: a session with no ticket gets a title with no key, no Jira line, and Claude is asked for no key', async () => {
    const noTicket: Partial<Session> = {
      title: 'Add a CSV export to the reports page',
      source: null,
      jiraUrl: null,
      activities: [
        { id: 'step-1', state: 'done', kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true },
        {
          id: 'step-2',
          state: 'done',
          kind: 'brief',
          key: null,
          tickets: [],
          message: true,
          pullRequests: [],
          files: [],
          skills: [],
        },
        { id: 'step-3', state: 'done', kind: 'finished', summary: 'Added the CSV export.' },
      ],
    };
    const drafted = await setUp({
      draft: [{ finish: 'Add a CSV export\n\nAdds an Export button.' }],
      session: noTicket,
    });
    await writeFile(join(drafted.worktree, 'README.md'), 'changed\n');
    expect(await drafted.pulls.draft(id)).toMatchObject({
      result: 'draft',
      title: 'Add a CSV export',
      body: 'Adds an Export button.',
      byClaude: true,
    });
    const [prompt = ''] = drafted.sdk.runs[0]?.prompts ?? [];
    expect(prompt).toMatch(/^The task, as Claude got it\n\n/);
    const instructions = JSON.stringify(drafted.sdk.runs[0]?.options.systemPrompt);
    expect(instructions).toContain('pull request');
    expect(instructions).not.toContain('key');

    const fallback = await setUp({ noClaude: true, session: noTicket });
    await writeFile(join(fallback.worktree, 'README.md'), 'changed\n');
    expect(await fallback.pulls.draft(id)).toMatchObject({
      title: 'Add a CSV export to the reports page',
      body: 'Added the CSV export.',
      byClaude: false,
    });
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
    // One worktree for every case, so the test stays quick when every file runs at once.
    const { repos, worktree, records, sdk, pulls, settings } = await setUp();
    const as = async (change: Partial<Session>) =>
      records.update(id, (current) => ({ ...current, session: { ...current.session, ...change } }));
    const expectCannot = async (name: string, reason: string) => {
      expect(await pulls.draft(id), name).toEqual({ result: 'cannot', reason });
    };

    await expectCannot('no changes', 'no_changes');
    await writeFile(join(worktree, 'README.md'), 'changed\n');
    for (const [change, reason] of [
      [{ state: 'working' }, 'working'],
      [{ state: 'stopped', discardedAt: '2026-10-18T10:00:00.000Z' }, 'discarded'],
      [{ state: 'pr_open', pullRequest: makeSessionPullRequest() }, 'opened'],
      [{ branch: null }, 'no_worktree'],
    ] as const) {
      await as(change);
      await expectCannot(reason, reason);
      await as({ state: 'done', discardedAt: null, pullRequest: null, branch: 'feat/PROJ-1423' });
    }
    await settings.update(() => ({}));
    await expectCannot('GitHub not connected', 'not_connected');
    await settings.update(() => ({ github: { method: 'token' } }));
    await repos.git(repos.clone, 'remote', 'set-url', 'origin', 'https://gitlab.com/acme/web-app.git');
    await expectCannot('origin elsewhere', 'not_github');
    await repos.git(repos.clone, 'remote', 'remove', 'origin');
    await expectCannot('no origin', 'no_origin');
    await rm(worktree, { recursive: true, force: true });
    await expectCannot('worktree gone', 'missing');
    expect(sdk.runs).toHaveLength(0);
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

describe('a pull request Claude opened itself (spec 026)', () => {
  const claudes = {
    owner: 'acme',
    repository: 'web-app',
    number: 2944,
    head: 'feat/PROJ-1423',
    base: 'main',
    title: 'Claude opened this',
    body: '',
  };

  it('saves the open pull request from the branch, linked, and the session as PR open', async () => {
    const { pulls, opened, records } = await readyToCreate({ session: { state: 'stopped' } });
    opened.push(claudes);

    await pulls.link(id);

    const { session } = (await records.get(id)) ?? {};
    expect(session?.state).toBe('pr_open');
    expect(session?.pullRequest).toMatchObject({ number: 2944, url: 'https://github.com/acme/web-app/pull/2944' });
    expect(session?.activities.at(-1)).toMatchObject({ kind: 'pull_request', number: 2944, linked: true });
    expect(opened).toHaveLength(1);
  });

  it('a follow-up after it that pushes nothing new adds no Pushed step', async () => {
    const { repos, worktree, pulls, opened, records } = await readyToCreate({ session: { state: 'stopped' } });
    // Claude committed, pushed and opened the pull request itself.
    await repos.git(worktree, 'add', '-A');
    await repos.git(worktree, 'commit', '-m', 'Claude committed this');
    await repos.git(worktree, 'push', 'origin', 'feat/PROJ-1423');
    opened.push(claudes);
    await pulls.link(id);
    const linked = (await records.get(id))?.session.activities.length ?? 0;
    // A follow-up took the stepper back and ended with nothing new pushed.
    await records.update(id, (current) => ({ ...current, session: { ...current.session, step: 'review' } }));

    await pulls.link(id);

    expect((await records.get(id))?.session.activities).toHaveLength(linked);
    expect(await pulls.draftPush(id)).toEqual({ result: 'nothing_new' });
  });

  it('changes nothing when GitHub has no open pull request from the branch', async () => {
    const { home, pulls } = await readyToCreate();
    const saved = join(sessionsFolder(home), id, 'session.json');
    const before = await hashOf(saved);
    await pulls.link(id);
    expect(await hashOf(saved)).toBe(before);
  });

  it('opening Create pull request finds it and says it is open, without asking Claude for a draft', async () => {
    const { pulls, opened, records, sdk } = await readyToCreate();
    opened.push(claudes);
    expect(await pulls.draft(id)).toEqual({ result: 'cannot', reason: 'opened' });
    expect((await records.get(id))?.session.pullRequest?.number).toBe(2944);
    expect(sdk.runs).toHaveLength(0);
  });
});

describe('pushing changes to the pull request (spec 014, Q7)', () => {
  const claudeMessage = '"Use the existing useSelection hook"\n\nAs the reviewer asked.';

  /** A session whose pull request is open; creating it asks Claude nothing, so its first call is the push's draft. */
  async function withPullRequestOpen(options: SetUpOptions = {}) {
    const set = await readyToCreate({ draft: [{ finish: claudeMessage }], ...options });
    const opened = await set.pulls.create(id, asked);
    if (opened?.result !== 'opened') throw new Error('the pull request should open');
    return set;
  }

  /** Claude carried on after a follow-up, and finished with this summary. */
  async function followedUp(records: Awaited<ReturnType<typeof setUp>>['records'], summary: string) {
    await records.update(id, (current) => ({
      ...current,
      session: {
        ...current.session,
        activities: [...current.session.activities, { id: 'step-9', state: 'done', kind: 'finished', summary }],
      },
    }));
  }

  it('AC-17: drafts a commit message from what changed since the push alone, with what will happen', async () => {
    const { worktree, sdk, records, pulls } = await withPullRequestOpen();
    await followedUp(records, 'Switched to the existing useSelection hook.');
    await writeFile(join(worktree, 'select.ts'), 'export { useSelection as select } from "./hooks";\n');

    expect(await pulls.draftPush(id)).toEqual({
      result: 'draft',
      message: 'Use the existing useSelection hook',
      byClaude: true,
      files: 1,
      branch: 'feat/PROJ-1423',
      number: 2841,
    });
    const [prompt = ''] = sdk.runs[0]?.prompts ?? [];
    expect(prompt).toContain('Switched to the existing useSelection hook.');
    expect(prompt).not.toContain('Added row selection.');
    expect(prompt).toContain('- select.ts +1 −1');
    expect(prompt).not.toContain('README.md');
    expect(sdk.runs[0]?.options.tools).toEqual([]);
  });

  it("AC-17: says there's nothing new to push, and pushes nothing", async () => {
    const { repos, pulls } = await withPullRequestOpen();
    const pushed = await repos.git(repos.origin, 'rev-parse', 'refs/heads/feat/PROJ-1423');
    expect(await pulls.draftPush(id)).toEqual({ result: 'nothing_new' });
    expect(await pulls.push(id, { message: 'Anything' })).toEqual({ result: 'nothing_new' });
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/feat/PROJ-1423')).toBe(pushed);
  });

  it("AC-17: starts from the ticket's title when Claude can't draft the message", async () => {
    const { worktree, pulls } = await withPullRequestOpen({
      draft: [{ message: { type: 'assistant', error: 'rate_limit', message: { content: [] } } }],
    });
    await writeFile(join(worktree, 'select.ts'), 'changed\n');
    expect(await pulls.draftPush(id)).toMatchObject({
      message: 'PROJ-1423: Add bulk archive to the content list',
      byClaude: false,
    });
  });

  it('AC-17: commits and pushes to the same branch, so the pull request updates, and keeps the step', async () => {
    const { repos, worktree, records, pulls, reports } = await withPullRequestOpen();
    await writeFile(join(worktree, 'select.ts'), 'changed\n');
    expect(await pulls.push(id, { message: 'Use the existing useSelection hook' })).toEqual({
      result: 'pushed',
      files: 1,
    });
    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    expect(await repos.git(repos.origin, 'rev-parse', 'refs/heads/feat/PROJ-1423')).toBe(head);
    expect(await repos.git(worktree, 'log', '-1', '--format=%B')).toBe(
      'Use the existing useSelection hook\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    );
    const saved = await records.get(id);
    expect(saved?.session).toMatchObject({ state: 'pr_open', step: 'pull_request' });
    expect(saved?.session.activities.at(-1)).toMatchObject({ kind: 'pushed', number: 2841, url: pullUrl, files: 1 });
    expect(saved?.pushedCommit).toBe(head);
    expect(reports.at(-1)).toEqual({
      what: 'pull_request',
      session: id,
      ticket: 'PROJ-1423',
      step: 'push',
      outcome: 'pushed',
      number: 2841,
    });
  });

  it('Claude’s own push to the open pull request, as Settings let it, moves the stepper on as yours does', async () => {
    const { repos, worktree, records, pulls } = await withPullRequestOpen();
    // A follow-up took the stepper back, and Claude committed and pushed by itself before it finished.
    await records.update(id, (current) => ({ ...current, session: { ...current.session, step: 'review' } }));
    await writeFile(join(worktree, 'select.ts'), 'changed\n');
    await repos.git(worktree, 'commit', '-am', 'Claude committed this');
    await repos.git(worktree, 'push', 'origin', 'feat/PROJ-1423');

    await pulls.link(id);

    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    const saved = await records.get(id);
    expect(saved?.session.step).toBe('pull_request');
    expect(saved?.session.activities.at(-1)).toMatchObject({ kind: 'pushed', number: 2841, files: 0 });
    expect(saved?.pushedCommit).toBe(head);
    // Nothing new since: the run's next end adds no second step.
    await pulls.link(id);
    expect((await records.get(id))?.session.activities).toHaveLength(saved?.session.activities.length ?? 0);
  });

  it('AC-17: pushes what Claude committed itself, committing nothing more', async () => {
    const { repos, worktree, records, pulls } = await withPullRequestOpen();
    await writeFile(join(worktree, 'select.ts'), 'changed\n');
    await repos.git(worktree, 'commit', '-am', 'Claude committed this');
    expect(await pulls.draftPush(id)).toMatchObject({ result: 'draft', files: 0 });
    expect(await pulls.push(id, { message: 'Unused' })).toEqual({ result: 'pushed', files: 0 });
    expect(await repos.git(worktree, 'log', '-1', '--format=%s')).toBe('Claude committed this');
    expect((await records.get(id))?.session.activities.at(-1)).toMatchObject({ kind: 'pushed', files: 0 });
  });

  it('AC-8, AC-17: a secret-looking file new since the push stops it', async () => {
    const { worktree, pulls } = await withPullRequestOpen();
    await writeFile(join(worktree, 'id_ed25519'), 'key\n');
    expect(await pulls.push(id, { message: 'Add a key' })).toEqual({
      result: 'failed',
      problem: { kind: 'secret', path: 'id_ed25519' },
    });
  });

  it("AC-8: commits nothing when the files new since the push can't be listed for the secret check", async () => {
    const { repos, worktree, records, pulls } = await withPullRequestOpen();
    await writeFile(join(worktree, 'select.ts'), 'changed\n');
    // A commit git doesn't have, as a repository rewritten under Orynx would leave it.
    await records.update(id, (current) => ({ ...current, pushedCommit: 'f'.repeat(40) }));
    const head = await repos.git(worktree, 'rev-parse', 'HEAD');
    expect(await pulls.push(id, { message: 'More' })).toEqual({ result: 'failed', problem: { kind: 'commit_failed' } });
    expect(await repos.git(worktree, 'rev-parse', 'HEAD')).toBe(head);
  });

  it("AC-17: says why it can't push", async () => {
    const before = await readyToCreate();
    expect(await before.pulls.draftPush(id)).toEqual({ result: 'cannot', reason: 'no_pull_request' });
    expect(await before.pulls.push(id, { message: 'x' })).toEqual({ result: 'cannot', reason: 'no_pull_request' });
    const opened = await withPullRequestOpen();
    await opened.records.update(id, (current) => ({ ...current, session: { ...current.session, state: 'working' } }));
    expect(await opened.pulls.draftPush(id)).toEqual({ result: 'cannot', reason: 'working' });
    await rm(opened.worktree, { recursive: true, force: true });
    await opened.records.update(id, (current) => ({ ...current, session: { ...current.session, state: 'pr_open' } }));
    expect(await opened.pulls.push(id, { message: 'x' })).toEqual({ result: 'cannot', reason: 'missing' });
    expect(await opened.pulls.draftPush('fedcba9876543210')).toBeNull();
    expect(await opened.pulls.push('fedcba9876543210', { message: 'x' })).toBeNull();
  });
});

describe('replying to reviewers (spec 049)', () => {
  const pullRequest = makeSessionPullRequest();
  const reviewed: FakePullContext = {
    number: 2841,
    threads: [
      {
        id: 'PRRT_a',
        resolved: false,
        path: 'src/ContentList.tsx',
        line: 42,
        comments: [
          { author: 'priya', body: 'Use the existing useSelection hook here.' },
          { author: githubLogin, body: 'Will do.' },
        ],
      },
      { id: 'PRRT_b', resolved: true, path: 'src/api.ts', line: 7, comments: [{ author: 'sam', body: 'Rename?' }] },
      { id: 'PRRT_c', resolved: false, path: 'README.md', line: null, comments: [{ author: null, body: 'A typo.' }] },
    ],
  };
  const claudeReplies = JSON.stringify({
    replies: [
      { thread: 'PRRT_a', reply: 'Done: the list uses useSelection now.' },
      { thread: 'PRRT_zz', reply: 'A thread that isn’t there.' },
    ],
  });
  const left = {
    id: 'PRRT_c',
    path: 'README.md',
    line: null,
    author: 'Someone',
    body: 'A typo.',
    reply: '',
    resolve: false,
  };

  it('AC-2: Claude drafts a reply for each thread its changes address, from the threads and the diff', async () => {
    const posted: FakeThreadWrite[] = [];
    const { worktree, sdk, pulls } = await setUp({
      draft: [{ finish: claudeReplies }],
      session: { state: 'pr_open', pullRequest },
    });
    github.use(acceptingReviewThreads([reviewed], { posted }));
    await writeFile(join(worktree, 'README.md'), '# web-app\n\nUses useSelection.\n');

    expect(await pulls.draftReplies(id)).toEqual({
      result: 'draft',
      number: 2841,
      byClaude: true,
      threads: [
        {
          id: 'PRRT_a',
          path: 'src/ContentList.tsx',
          line: 42,
          author: githubLogin,
          body: 'Will do.',
          reply: 'Done: the list uses useSelection now.',
          resolve: true,
        },
        left,
      ],
    });
    const [prompt = ''] = sdk.runs[0]?.prompts ?? [];
    expect(prompt).toContain('PRRT_a on src/ContentList.tsx line 42');
    expect(prompt).toContain('priya: Use the existing useSelection hook here.');
    expect(prompt).toContain('+Uses useSelection.');
    expect(prompt).not.toContain('PRRT_b');
    // AC-8: a draft writes nothing to GitHub.
    expect(posted).toEqual([]);
  });

  it("AC-4: when Claude can't draft, or answers with something else, every box starts empty and unticked", async () => {
    for (const options of [{ noClaude: true }, { draft: [{ finish: 'Sure, I fixed them all!' }] }]) {
      const { pulls } = await setUp({ ...options, session: { state: 'pr_open', pullRequest } });
      github.use(acceptingReviewThreads([reviewed]));
      const answer = await pulls.draftReplies(id);
      expect(answer).toMatchObject({ result: 'draft', byClaude: false });
      expect(answer?.result === 'draft' && answer.threads.map(({ reply, resolve }) => ({ reply, resolve }))).toEqual([
        { reply: '', resolve: false },
        { reply: '', resolve: false },
      ]);
    }
  });

  it('AC-7: with no unresolved thread, answers none and never asks Claude', async () => {
    const { sdk, pulls } = await setUp({ session: { state: 'pr_open', pullRequest } });
    github.use(acceptingReviewThreads([{ number: 2841, threads: [] }]));
    expect(await pulls.draftReplies(id)).toEqual({ result: 'draft', number: 2841, byClaude: false, threads: [] });
    expect(sdk.runs).toHaveLength(0);
  });

  it('AC-6: says why it can’t: no pull request, GitHub not connected, or GitHub not answering', async () => {
    expect(await (await setUp()).pulls.draftReplies(id)).toEqual({ result: 'cannot', reason: 'no_pull_request' });
    const offline = await setUp({ connected: false, session: { state: 'pr_open', pullRequest } });
    expect(await offline.pulls.draftReplies(id)).toEqual({ result: 'cannot', reason: 'not_connected' });
    const { pulls } = await setUp({ session: { state: 'pr_open', pullRequest } });
    github.use(http.post(graphqlUrl, () => HttpResponse.error()));
    expect(await pulls.draftReplies(id)).toEqual({ result: 'failed', problem: { kind: 'github_unreachable' } });
    expect(await pulls.draftReplies('fedcba9876543210')).toBeNull();
  });

  it('AC-3: posts each reply as you left it, then resolves the ticked threads, in order', async () => {
    const posted: FakeThreadWrite[] = [];
    const { pulls } = await setUp({ session: { state: 'pr_open', pullRequest } });
    github.use(acceptingReviewThreads([reviewed], { posted }));

    expect(
      await pulls.postReplies(id, {
        threads: [
          { id: 'PRRT_a', reply: 'Done: it uses useSelection.', resolve: true },
          { id: 'PRRT_c', reply: '', resolve: true },
        ],
      }),
    ).toEqual({ result: 'posted', failed: [] });
    expect(posted).toEqual([
      { thread: 'PRRT_a', reply: 'Done: it uses useSelection.' },
      { thread: 'PRRT_a', resolved: true },
      { thread: 'PRRT_c', resolved: true },
    ]);
  });

  it('AC-5: a thread GitHub refuses comes back with its words, and says when its reply went out before Resolve failed', async () => {
    const posted: FakeThreadWrite[] = [];
    const { pulls } = await setUp({ session: { state: 'pr_open', pullRequest } });
    github.use(acceptingReviewThreads([reviewed], { posted, refuse: ['PRRT_a'], refuseResolve: ['PRRT_c'] }));
    const said = { kind: 'github_said', message: 'Resource not accessible by personal access token' };

    expect(
      await pulls.postReplies(id, {
        threads: [
          { id: 'PRRT_a', reply: 'Done.', resolve: true },
          { id: 'PRRT_c', reply: 'Fixed the typo.', resolve: true },
        ],
      }),
    ).toEqual({
      result: 'posted',
      failed: [
        { id: 'PRRT_a', problem: said, replied: false },
        { id: 'PRRT_c', problem: said, replied: true },
      ],
    });
    expect(posted).toEqual([{ thread: 'PRRT_c', reply: 'Fixed the typo.' }]);
  });

  it('AC-6: posts nothing without a pull request or a GitHub connection', async () => {
    const request = { threads: [{ id: 'PRRT_a', reply: 'Done.', resolve: true }] };
    expect(await (await setUp()).pulls.postReplies(id, request)).toEqual({
      result: 'cannot',
      reason: 'no_pull_request',
    });
    const offline = await setUp({ connected: false, session: { state: 'pr_open', pullRequest } });
    expect(await offline.pulls.postReplies(id, request)).toEqual({ result: 'cannot', reason: 'not_connected' });
  });
});
