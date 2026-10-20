import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { ticketsHandler, ticketsToday } from '../../../test/tickets.ts';
import { useComposerStore } from '../../home/store.ts';
import { movesFor } from './ship-button.tsx';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Tickets, two folders, and a count of every start asked for, which must stay at none. */
function serve(): () => number {
  let starts = 0;
  server.use(
    ticketsHandler(),
    http.get(apiUrl(apiRoutes.repositories), () =>
      HttpResponse.json({
        repositories: [
          makeRepository({ id: '00000000000000aa', name: 'web-app', jiraProject: 'PROJ' }),
          makeRepository({ id: '00000000000000bb', name: 'web-app-2', jiraProject: 'PROJ' }),
        ],
      }),
    ),
    http.post(apiUrl(apiRoutes.sessions), () => {
      starts += 1;
      return HttpResponse.json({ result: 'started', sessionId: '0123456789abcdef' });
    }),
  );
  return () => starts;
}

const box = () => screen.getByRole('textbox', { name: 'Describe a task for Claude' });

describe('Ship (spec 022, E)', () => {
  it('AC-35, AC-39: a card’s sparkle adds the ticket after the chips there, opens Home with focus in the box, and starts nothing', async () => {
    const starts = serve();
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1402' }] });
    const { user, history } = await renderApp({ route: '/tickets' });
    const card = await screen.findByRole('article', { name: 'Search returns archived sites for guest users' });

    await user.click(within(card).getByRole('button', { name: 'Ship PROJ-1377' }));

    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => {
      expect(history.location.pathname).toBe('/');
    });
    expect(useComposerStore.getState().chips).toEqual([
      { kind: 'jira', key: 'PROJ-1402' },
      { kind: 'jira', key: 'PROJ-1377' },
    ]);
    await waitFor(() => {
      expect(box()).toHaveFocus();
    });
    expect(starts()).toBe(0);
  });

  it('AC-36: the list’s Ship does the same', async () => {
    const starts = serve();
    const { user, history } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'List' }));

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: 'Ship PROJ-1377' }));

    await waitFor(() => {
      expect(history.location.pathname).toBe('/');
    });
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'jira', key: 'PROJ-1377' }]);
    expect(starts()).toBe(0);
  });

  it('AC-37: a ticket already in the composer isn’t added twice', async () => {
    serve();
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1377' }] });
    const { user, history } = await renderApp({ route: '/tickets' });
    const card = await screen.findByRole('article', { name: 'Search returns archived sites for guest users' });

    await user.click(within(card).getByRole('button', { name: 'Ship PROJ-1377' }));

    await waitFor(() => {
      expect(history.location.pathname).toBe('/');
    });
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'jira', key: 'PROJ-1377' }]);
  });

  it('AC-38: a card with a live session has Claude’s state, and no Ship', async () => {
    serve();
    await renderApp({ route: '/tickets' });
    const card = await screen.findByRole('article', { name: 'Add bulk archive to the content list' });
    expect(within(card).getByRole('link', { name: 'Needs you' })).toHaveAttribute('href', '/sessions/session-1423');
    expect(within(card).queryByRole('button', { name: /^Ship / })).toBeNull();
  });
});

describe('movesFor (the user’s call, 20 Oct 2026)', () => {
  const at = new Map([
    ['ORX-1', 'to_do'],
    ['ORX-2', 'in_review'],
    ['ORX-3', 'done'],
    ['PROJ-1', 'to_do'],
  ] as const);

  it('offers every column after the furthest one ticked, and nothing past Done', () => {
    expect(movesFor(['ORX-1'], at)).toEqual(['in_progress', 'in_review', 'done']);
    expect(movesFor(['ORX-1', 'ORX-2'], at)).toEqual(['done']);
    expect(movesFor(['ORX-1', 'ORX-3'], at)).toEqual([]);
  });

  it('offers nothing with a Jira ticket ticked, or one Tickets no longer holds', () => {
    expect(movesFor(['ORX-1', 'PROJ-1'], at)).toEqual([]);
    expect(movesFor(['ORX-1', 'ORX-9'], at)).toEqual([]);
  });
});
