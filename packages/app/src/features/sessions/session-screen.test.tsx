import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeSession, makeSessionChanges, makeSessionTicket } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';

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

function pageBar() {
  return screen.getByRole('banner');
}

describe('SessionScreen', () => {
  it('013 AC-1: puts Claude’s progress, with the follow-up box, beside the Changes and Ticket tabs, Changes open', async () => {
    server.use(
      sessionHandler({ ...working, ticket: makeSessionTicket() }),
      http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
    );
    await renderApp({ route });

    const progress = await screen.findByRole('region', { name: "Claude's progress" });
    expect(within(progress).getByRole('textbox', { name: 'Message Claude' })).toBeVisible();
    const details = screen.getByRole('region', { name: 'Work details' });
    const tabs = within(details).getByRole('tablist', { name: 'Session details' });
    expect(await within(tabs).findByRole('tab', { name: 'Changes 4' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: 'Ticket PROJ-1423' })).toHaveAttribute('aria-selected', 'false');
    expect(within(details).getByRole('tabpanel', { name: 'Changes 4' })).toBeVisible();
    expect(within(details).getByRole('button', { name: 'Discard changes' })).toBeVisible();
  });

  it('AC-6 (Q9e): the page bar shows Tickets / the sprint / the key, when it started, and Open in Jira', async () => {
    server.use(sessionHandler(working));
    const { user, platform } = await renderApp({ route });

    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(await within(crumbs).findByText('PROJ-1423')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets');
    expect(within(crumbs).getByRole('link', { name: 'Sprint 42' })).toHaveAttribute('href', '/tickets');
    expect(within(pageBar()).getByText('Started 4 min ago')).toBeVisible();

    const jira = within(pageBar()).getByRole('link', { name: 'Open in Jira' });
    expect(jira).toHaveAttribute('href', 'https://your-team.atlassian.net/browse/PROJ-1423');
    await user.click(jira);
    expect(platform.openExternal).toHaveBeenCalledWith('https://your-team.atlassian.net/browse/PROJ-1423');
  });

  it('Q9e: says Sessions / the key when the ticket wasn’t in a sprint', async () => {
    server.use(sessionHandler({ ...working, sprint: null }));
    await renderApp({ route });
    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(await within(crumbs).findByText('PROJ-1423')).toBeVisible();
    expect(within(crumbs).getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/sessions');
  });

  it('AC-16: shows the page bar and skeletons in the page’s shape while the session loads', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.session), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    await renderApp({ route });

    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Sessions' })).toBeVisible();
    expect(screen.getByRole('main').querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('AC-17: says the page does not exist for an unknown session', async () => {
    server.use(sessionHandler(working));
    await renderApp({ route: '/sessions/fedcba9876543210' });
    expect(await screen.findByText('This page does not exist')).toBeVisible();
  });

  it('AC-17: says the session couldn’t load, and tries again on request', async () => {
    let fail = true;
    server.use(
      http.get(apiUrl(apiRoutes.session), () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(working),
      ),
    );
    const { user } = await renderApp({ route });

    expect(await within(screen.getByRole('main')).findByText("Couldn't load sessions")).toBeVisible();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add bulk archive to the content list' }),
    ).toBeVisible();
  });
});
