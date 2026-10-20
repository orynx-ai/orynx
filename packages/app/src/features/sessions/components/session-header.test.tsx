import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Session } from '@devhub/contracts';
import { makePushDraft, makeSession, makeSessionChanges, makeSessionPullRequest } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
// Four minutes after the session started.
const now = new Date('2026-10-16T10:00:00.000Z');

const working = makeSession({
  id,
  title: 'Add bulk archive to the content list',
  state: 'working',
  source: { kind: 'jira', key: 'PROJ-1423' },
  folder: { name: 'web-app', displayPath: '~/code/web-app' },
  branch: 'feat/PROJ-1423',
  startedAt: '2026-10-16T09:56:00.000Z',
  sprint: 'Sprint 42',
  jiraUrl: 'https://your-team.atlassian.net/browse/PROJ-1423',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pageBar = () => screen.getByRole('banner');

/** A window under 768 px. */
function narrow() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Done, with a change in its worktree, so it offers Create pull request. */
const done = makeSession({ ...working, state: 'done', worktreePath: '/Users/you/.devhub/worktrees/x' });

describe('SessionHeader', () => {
  it('AC-6: the title row has the title, the state, the branch and where Claude works; Stop Claude is in the page bar', async () => {
    server.use(sessionHandler(working));
    await renderApp({ route });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add bulk archive to the content list' }),
    ).toBeVisible();
    const main = screen.getByRole('main');
    expect(within(main).getByText('Working')).toBeVisible();
    expect(within(main).getByText('feat/PROJ-1423')).toBeVisible();
    expect(within(main).getByText('in web-app · separate worktree, your main checkout is untouched')).toBeVisible();
    expect(within(pageBar()).getByRole('button', { name: 'Stop Claude' })).toBeVisible();
  });

  it('AC-14 (spec 031): a session on your pull request’s branch says so', async () => {
    const number = 2836;
    server.use(
      sessionHandler(
        makeSession({
          ...working,
          workOn: 'pull_request',
          branch: 'fix/content-list',
          source: { kind: 'pull_request', number },
          pullRequest: makeSessionPullRequest({ number }),
        }),
      ),
    );
    await renderApp({ route });
    const main = await screen.findByRole('main');
    expect(
      await within(main).findByText(`in web-app · on #${String(number)}'s branch, in a separate worktree`),
    ).toBeVisible();
    expect(within(main).getByText('fix/content-list')).toBeVisible();
  });

  it('puts Create pull request in the page bar, with Open in the editor and Discard changes in More actions', async () => {
    server.use(
      sessionHandler(done),
      http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
    );
    const { user } = await renderApp({ route });

    expect(await within(pageBar()).findByRole('button', { name: 'Create pull request' })).toBeVisible();
    const more = within(pageBar()).getByRole('button', { name: 'More actions' });
    await user.click(more);
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Open in VS Code', 'Discard changes']);
    expect(within(menu).getByRole('menuitem', { name: 'Open in VS Code' })).toHaveAttribute(
      'href',
      'vscode://file/Users/you/.devhub/worktrees/x',
    );
  });

  it('under 768 px puts Create pull request in More actions too, and Esc on its dialog gives More actions focus', async () => {
    narrow();
    server.use(
      sessionHandler(done),
      http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
      http.post(apiUrl(apiRoutes.sessionPullRequestDraft), () =>
        HttpResponse.json({ result: 'cannot', reason: 'no_origin' }),
      ),
    );
    const { user } = await renderApp({ route });
    const more = await within(pageBar()).findByRole('button', { name: 'More actions' });
    await user.click(more);
    await waitFor(() => {
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Create pull request',
        'Open in VS Code',
        'Discard changes',
      ]);
    });
    expect(screen.queryByRole('button', { name: 'Create pull request' })).toBeNull();

    await user.click(screen.getByRole('menuitem', { name: 'Create pull request' }));
    expect(await screen.findByRole('dialog', { name: 'Create pull request' })).toBeVisible();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more).toHaveFocus();
  });

  it('under 768 px, once the pull request is open, More actions holds Open PR and Push changes', async () => {
    narrow();
    const open = makeSession({
      ...done,
      state: 'pr_open',
      step: 'pull_request',
      pullRequest: makeSessionPullRequest(),
    });
    server.use(
      sessionHandler(open),
      http.post(apiUrl(apiRoutes.sessionPushDraft), () => HttpResponse.json(makePushDraft())),
    );
    const { user, platform } = await renderApp({ route });
    const more = await within(pageBar()).findByRole('button', { name: 'More actions' });
    expect(within(pageBar()).queryByRole('link', { name: /^Open PR/ })).toBeNull();
    expect(within(pageBar()).queryByRole('button', { name: 'Push changes' })).toBeNull();

    await user.click(more);
    const pr = `#${String(2841)}`;
    await user.click(screen.getByRole('menuitem', { name: `Open PR ${pr}` }));
    expect(platform.openExternal).toHaveBeenCalledWith(open.pullRequest?.url);

    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Push changes' }));
    expect(await screen.findByRole('dialog', { name: 'Push changes' })).toBeVisible();
  });

  it('012 AC-1, Q8d: while a call waits, the pill says the session needs your approval, and Stop Claude stays', async () => {
    server.use(sessionHandler({ ...working, state: 'needs_you' }));
    await renderApp({ route });
    await screen.findByRole('heading', { level: 1 });
    const main = screen.getByRole('main');
    expect(within(main).getByText('Needs your approval')).toBeVisible();
    expect(within(main).getByRole('button', { name: 'Stop Claude' })).toBeVisible();
  });

  it.each([
    ['done', 'Done, ready for PR'],
    ['stopped', 'Stopped'],
  ] as const)('AC-8, AC-9: a session that is %s says so, and has no Stop Claude', async (state, word) => {
    server.use(sessionHandler({ ...working, state }));
    await renderApp({ route });
    await screen.findByRole('heading', { level: 1 });
    const main = screen.getByRole('main');
    expect(within(main).getByText(word)).toBeVisible();
    expect(within(main).queryByRole('button', { name: 'Stop Claude' })).toBeNull();
  });

  it('shows no branch before the worktree is made', async () => {
    server.use(sessionHandler({ ...working, branch: null }));
    await renderApp({ route });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('feat/PROJ-1423')).toBeNull();
  });

  it('AC-9: Stop Claude says Stopping… and keeps focus, then the title takes focus once it has stopped', async () => {
    let current: Session = working;
    const stops: string[] = [];
    server.use(
      http.get(apiUrl(apiRoutes.session), () => HttpResponse.json(current)),
      http.post(apiUrl(apiRoutes.sessionStop), ({ params }) => {
        stops.push(String(params['id']));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp({ route });
    const stop = await screen.findByRole('button', { name: 'Stop Claude' });

    await user.click(stop);

    expect(stops).toEqual([id]);
    const stopping = screen.getByRole('button', { name: 'Stopping…' });
    expect(stopping).toHaveAttribute('aria-disabled', 'true');
    expect(stopping).toHaveFocus();

    current = { ...working, state: 'stopped' };
    FakeEventSource.latest().emit({ type: 'sessions.changed' });

    const title = screen.getByRole('heading', { level: 1, name: 'Add bulk archive to the content list' });
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
    expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull();
  });
});
