import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ComposerChip } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createGitHubClient } from '../integrations/github/client.ts';
import { createGitHubConnection } from '../integrations/github/connection.ts';
import { createGhCli } from '../integrations/github/gh.ts';
import { createJiraClient } from '../integrations/jira/client.ts';
import { createJiraConnection } from '../integrations/jira/connection.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { acceptingPullContext, acceptingPullDiff, githubToken, graphqlUrl } from '../test/fake-github.ts';
import { acceptingIssue, goodToken, issueUrl, jiraEmail, jiraSite } from '../test/fake-jira.ts';
import { createContextReader } from './context-reader.ts';

/** Jira and GitHub, the outside services, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  outside.resetHandlers();
});
afterAll(() => {
  outside.close();
});

const connected: Settings = { jira: { site: jiraSite, email: jiraEmail }, github: { method: 'token' } };

function setUp(initial: Settings = connected) {
  const events = createEventBus();
  const settings = createMemorySettingsStore(initial);
  const tokens = createTokenStore({
    keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
    events,
  });
  const jira = createJiraClient({ timeoutMs: 300 });
  const github = createGitHubClient({ timeoutMs: 300 });
  return createContextReader({
    home,
    jira,
    jiraConnection: createJiraConnection({ settings, tokens, jira, events, envToken: false }),
    github,
    githubConnection: createGitHubConnection({
      settings,
      tokens,
      github,
      gh: createGhCli({ searchPath: '' }),
      events,
      envToken: false,
    }),
  });
}

const ticket = { kind: 'jira', key: 'PROJ-1423' } as const;
const pull = { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 } as const;
/** A file you picked, in a home folder of the test's own (spec 022). */
const file = { kind: 'file', path: '~/notes.md' } as const;
let home = '';
beforeAll(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-context-home-')));
  await writeFile(join(home, 'notes.md'), 'Export every column.');
  await mkdir(join(home, 'folder'));
});
afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});
const diff = 'diff --git a/src/people.ts b/src/people.ts\n@@ -1 +1 @@\n-const page = 20;\n+const page = 50;';

describe('the context reader (spec 015)', () => {
  it('AC-20: reads the ticket and the pull request at once, and keeps every chip in the order you added it', async () => {
    outside.use(
      acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive', type: 'Story', description: null }),
      acceptingPullContext([
        { number: 2836, title: 'Lazy-load the people directory', base: 'main', head: 'feat/lazy-people', body: null },
      ]),
      acceptingPullDiff([{ number: 2836, diff }]),
    );

    expect(await setUp().read([file, pull, ticket])).toEqual({
      ok: true,
      chips: [
        { kind: 'file', path: '~/notes.md', real: join(home, 'notes.md') },
        {
          kind: 'pull_request',
          owner: 'acme',
          name: 'web-app',
          number: 2836,
          title: 'Lazy-load the people directory',
          body: null,
          base: 'main',
          head: 'feat/lazy-people',
          failingChecks: [],
          comments: [],
          diff: { kind: 'text', text: diff },
        },
        {
          kind: 'jira',
          key: 'PROJ-1423',
          summary: 'Add bulk archive',
          type: 'Story',
          description: null,
          comments: [],
          links: [],
        },
      ],
    });
  });

  it('AC-20 (Q4): gives the changed files with their counts when GitHub finds the diff too large', async () => {
    outside.use(
      acceptingPullContext([{ number: 2836, files: [{ path: 'data/people.json', additions: 90_000, deletions: 12 }] }]),
      acceptingPullDiff([{ number: 2836, tooLarge: true }]),
    );
    const read = await setUp().read([pull]);
    expect(read.ok && read.chips[0]?.kind === 'pull_request' && read.chips[0].diff).toEqual({
      kind: 'too_large',
      files: [{ path: 'data/people.json', additions: 90_000, deletions: 12 }],
    });
  });

  it('AC-4: asks nothing of Jira or GitHub for files alone, even with neither connected', async () => {
    const asked: string[] = [];
    outside.events.on('request:start', ({ request }) => asked.push(request.url));
    expect(await setUp({}).read([file])).toEqual({
      ok: true,
      chips: [{ kind: 'file', path: '~/notes.md', real: join(home, 'notes.md') }],
    });
    expect(asked).toEqual([]);
  });

  it('022 AC-16: a file that isn’t there, or is a folder, fails as not found, by its place', async () => {
    for (const path of ['~/gone.md', '~/folder', join(home, 'gone.md')]) {
      expect(await setUp({}).read([file, { kind: 'file', path }])).toEqual({
        ok: false,
        chip: 1,
        problem: 'not_found',
      });
    }
  });

  it.each<[string, Settings, ComposerChip]>([
    ['Jira', { github: { method: 'token' } }, ticket],
    ['GitHub', { jira: { site: jiraSite, email: jiraEmail } }, pull],
  ])('AC-21: a chip from %s while it isn’t connected fails as not connected', async (_tool, settings, chip) => {
    expect(await setUp(settings).read([file, chip])).toEqual({ ok: false, chip: 1, problem: 'not_connected' });
  });

  it('AC-21: names the first chip that failed, by its place: a ticket Jira can’t find, a pull request GitHub hides', async () => {
    outside.use(acceptingIssue({ key: 'PROJ-1423' }), acceptingPullContext([]), acceptingPullDiff([]));
    expect(await setUp().read([file, pull, { kind: 'jira', key: 'PROJ-9999' }])).toEqual({
      ok: false,
      chip: 1,
      problem: 'not_found',
    });
    expect(await setUp().read([{ kind: 'jira', key: 'PROJ-9999' }, file])).toEqual({
      ok: false,
      chip: 0,
      problem: 'not_found',
    });
  });

  it('AC-21: a slow Jira or GitHub is unreachable, and refused credentials are not connected', async () => {
    outside.use(
      http.get(issueUrl('PROJ-1423'), async () => {
        await delay(1000);
        return HttpResponse.json({});
      }),
      http.post(graphqlUrl, () => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })),
      acceptingPullDiff([{ number: 2836, diff }]),
    );
    expect(await setUp().read([ticket])).toEqual({ ok: false, chip: 0, problem: 'unreachable' });
    expect(await setUp().read([pull])).toEqual({ ok: false, chip: 0, problem: 'not_connected' });
  });

  it('AC-21: anything else GitHub says, such as its rate limit, is another problem', async () => {
    outside.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json(
          { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded.' }] },
          { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792245900' } },
        ),
      ),
      acceptingPullDiff([{ number: 2836, diff }]),
    );
    expect(await setUp().read([pull])).toEqual({ ok: false, chip: 0, problem: 'other' });
  });
});
