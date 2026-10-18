import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
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
});

describe('SessionHeader', () => {
  it('AC-6: the title row has the title, the state, the branch and where Claude works, with Stop Claude', async () => {
    server.use(sessionHandler(working));
    await renderApp({ route });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add bulk archive to the content list' }),
    ).toBeVisible();
    const main = screen.getByRole('main');
    expect(within(main).getByText('Working')).toBeVisible();
    expect(within(main).getByText('feat/PROJ-1423')).toBeVisible();
    expect(within(main).getByText('in web-app · separate worktree, your main checkout is untouched')).toBeVisible();
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
