import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeInbox, makeInboxItem } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const older = makeInboxItem({
  id: 'github:acme/web-app/1',
  title: 'Older pull request',
  waitingSince: '2026-10-10T09:00:00.000Z',
});
const newer = makeInboxItem({
  id: 'github:acme/web-app/2',
  title: 'Newer pull request',
  waitingSince: '2026-10-16T09:00:00.000Z',
});
const ticket = makeInboxItem({
  id: 'jira:PROJ-1',
  source: 'jira',
  tab: 'jira',
  title: 'A ticket',
  subject: { kind: 'issue', key: 'PROJ-1', status: 'To Do', highPriorityBug: false },
  reason: { kind: 'status', category: 'to_do' },
  target: { kind: 'external', url: 'https://acme.atlassian.net/browse/PROJ-1' },
});

beforeEach(() => {
  server.use(http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox({ items: [older, ticket, newer] }))));
});

async function openHome(route = '/') {
  const rendered = await renderApp({ route });
  const panel = screen.getByRole('region', { name: 'Needs your attention' });
  await within(panel).findAllByRole('listitem');
  return { ...rendered, panel };
}

function titles(panel: HTMLElement) {
  return within(panel)
    .getAllByRole('listitem')
    .map((row) => within(row).getAllByRole('link')[0]?.textContent);
}

describe('OrderMenu', () => {
  it('AC-39: switches to the longest wait first, keeps it in the address and across tabs', async () => {
    const { user, history, panel } = await openHome();
    expect(titles(panel)).toEqual(['Newer pull request', 'A ticket', 'Older pull request']);

    await user.click(within(panel).getByRole('button', { name: 'Order: Newest first' }));
    expect(screen.getByRole('menuitemradio', { name: 'Newest first' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('menuitemradio', { name: 'Longest wait first' }));

    expect(history.location.search).toBe('?sort=longest');
    expect(within(panel).getByRole('button', { name: 'Order: Longest wait first' })).toHaveFocus();
    expect(titles(panel)).toEqual(['Older pull request', 'A ticket', 'Newer pull request']);

    await user.click(within(panel).getByRole('tab', { name: 'Pull requests 2' }));
    expect(history.location.search).toBe('?inbox=pull-requests&sort=longest');
    expect(titles(panel)).toEqual(['Older pull request', 'Newer pull request']);
  });

  it('AC-39, AC-45: a reload keeps the order, and the keyboard picks the other one', async () => {
    const { user, history, panel } = await openHome('/?sort=longest');
    expect(titles(panel)).toEqual(['Older pull request', 'A ticket', 'Newer pull request']);

    act(() => {
      within(panel).getByRole('button', { name: 'Order: Longest wait first' }).focus();
    });
    // As in a browser: the arrow opens the menu on its first choice, and Enter picks it.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Newest first' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(history.location.search).toBe('');
    await waitFor(() => {
      expect(within(panel).getByRole('button', { name: 'Order: Newest first' })).toHaveFocus();
    });
    expect(screen.queryByRole('menu', { name: 'Order' })).not.toBeInTheDocument();
  });
});
