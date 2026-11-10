import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type PullThreadsAnswer } from '@devhub/contracts';
import { makePullThread, makeSession, makeSessionChanges, makeSessionPullRequest } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const now = new Date('2026-11-10T10:00:00.000Z');

const prOpen = makeSession({
  id,
  title: 'Add bulk archive to the content list',
  state: 'pr_open',
  branch: 'feat/PROJ-1423',
  pullRequest: makeSessionPullRequest(),
});

const placed = makePullThread();
const outdated = makePullThread({
  id: 'PRRT_b',
  path: 'src/api.ts',
  line: 7,
  outdated: true,
  placeable: false,
  url: 'https://github.com/acme/web-app/pull/2841#discussion_r2001',
  comments: [
    { author: 'sam', body: 'Why remove this?', at: '2026-11-09T09:00:00.000Z' },
    { author: 'neha', body: 'It was unused.', at: '2026-11-09T10:00:00.000Z' },
  ],
});
const elsewhere = makePullThread({
  id: 'PRRT_c',
  line: 120,
  placeable: false,
  url: 'https://github.com/acme/web-app/pull/2841#discussion_r3001',
  comments: [{ author: 'kai', body: 'And here?', at: '2026-11-10T09:00:00.000Z' }],
});

function threads(answer: PullThreadsAnswer) {
  server.use(
    sessionHandler(prOpen),
    http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
    http.get(apiUrl(apiRoutes.sessionReviewThreads), () => HttpResponse.json(answer)),
  );
}

async function details() {
  return screen.findByRole('region', { name: 'Work details' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the Review comments tab (spec 057, B)', () => {
  it('AC-18, AC-19, AC-21: counts the open threads, and lists them by file with every comment and its labels', async () => {
    threads({ result: 'threads', threads: [placed, outdated, elsewhere] });
    const { user } = await renderApp({ route });
    const pane = await details();

    const tab = await within(pane).findByRole('tab', { name: 'Review comments 3' });
    await user.click(tab);
    const panel = within(pane).getByRole('tabpanel', { name: 'Review comments 3' });

    const contentList = within(panel).getByRole('region', { name: 'src/ContentList.tsx' });
    expect(within(contentList).getAllByRole('article')).toHaveLength(2);
    const maria = within(contentList).getByRole('article', { name: 'maria on line 42' });
    expect(within(maria).getByText(/^Use the existing/)).toBeVisible();
    expect(within(maria).getByRole('link', { name: 'Open on GitHub' })).toHaveAttribute('href', placed.url);
    const kai = within(contentList).getByRole('article', { name: 'kai on line 120' });
    expect(within(kai).getByText("Not in this session's changes")).toBeVisible();

    const sam = within(within(panel).getByRole('region', { name: 'src/api.ts' })).getByRole('article', {
      name: 'sam on line 7',
    });
    expect(within(sam).getByText('Outdated')).toBeVisible();
    expect(within(sam).getByText('It was unused.')).toBeVisible();
    expect(within(sam).getByText('neha')).toBeVisible();
  });

  it('AC-18: shows skeleton threads while they load', async () => {
    server.use(
      sessionHandler(prOpen),
      http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
      http.get(apiUrl(apiRoutes.sessionReviewThreads), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    await renderApp({ route: `${route}?tab=comments` });
    const pane = await details();
    const panel = await within(pane).findByRole('tabpanel', { name: 'Review comments' });
    expect(panel.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(panel).queryByRole('article')).toBeNull();
  });

  it('AC-22: with no open thread, the tab has no count and says so', async () => {
    threads({ result: 'threads', threads: [] });
    const { user } = await renderApp({ route });
    const pane = await details();

    const tab = await within(pane).findByRole('tab', { name: 'Review comments' });
    await user.click(tab);
    expect(await within(pane).findByText('No open review comments.')).toBeVisible();
  });

  it('AC-23: GitHub failing says so, and Try again reads the threads again', async () => {
    let asked = 0;
    server.use(
      sessionHandler(prOpen),
      http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
      http.get(apiUrl(apiRoutes.sessionReviewThreads), () => {
        asked += 1;
        return HttpResponse.json(
          asked === 1
            ? { result: 'failed', problem: { kind: 'github_unreachable' } }
            : { result: 'threads', threads: [placed] },
        );
      }),
    );
    const { user } = await renderApp({ route: `${route}?tab=comments` });
    const pane = await details();

    expect(await within(pane).findByText("Couldn't load review comments.")).toBeVisible();
    await user.click(within(pane).getByRole('button', { name: 'Try again' }));
    expect(await within(pane).findByRole('article', { name: 'maria on line 42' })).toBeVisible();
  });

  it("AC-25: a session with no pull request, or a review of someone else's, has no Review comments tab", async () => {
    server.use(
      sessionHandler(makeSession({ id, state: 'done' })),
      http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
    );
    await renderApp({ route });
    const pane = await details();
    await within(pane).findByRole('tab', { name: /^Changes/ });
    expect(within(pane).queryByRole('tab', { name: /Review comments/ })).toBeNull();
  });

  it('AC-26: the arrow keys reach the tab, and Tab reaches each link in reading order', async () => {
    threads({ result: 'threads', threads: [placed, elsewhere] });
    const { user } = await renderApp({ route });
    const pane = await details();
    const changes = await within(pane).findByRole('tab', { name: /^Changes/ });
    await within(pane).findByRole('tab', { name: 'Review comments 2' });

    changes.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(pane).getByRole('tab', { name: 'Review comments 2' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(within(pane).getByRole('tab', { name: 'Review comments 2' })).toHaveAttribute('aria-selected', 'true');
    });
    const links = within(pane).getAllByRole('link', { name: 'Open on GitHub' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([placed.url, elsewhere.url]);
  });
});
