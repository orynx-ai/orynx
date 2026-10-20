import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '@devhub/contracts';
import { makeSession, makeSessionApproval, makeSessionList } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { server, sessionHandler, sessionsHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const waiting = (id: string, at: string, extra: Partial<SessionSummary> = {}) => ({
  id,
  title: 'Add bulk archive',
  state: 'needs_you' as const,
  source: { kind: 'jira' as const, key: 'PROJ-1423' },
  updatedAt: at,
  ...extra,
});

describe('the waiting banner (spec 015)', () => {
  it('AC-25: floats as a pop-up naming the session and what Claude wants to run, and Review opens it', async () => {
    server.use(
      sessionsHandler(makeSessionList([waiting('00000000000000a1', '2026-10-18T09:00:00.000Z')])),
      sessionHandler(
        makeSession({
          id: '00000000000000a1',
          state: 'needs_you',
          approvals: [makeSessionApproval({ command: 'npm test' })],
        }),
      ),
    );
    const { user, history } = await renderApp();

    const banner = await screen.findByRole('status', { name: 'Claude is waiting for your approval' });
    await waitFor(() => {
      expect(banner).toHaveAccessibleDescription('PROJ-1423 · Add bulk archive · wants to run npm test');
    });
    // It floats over the page instead of taking room in Home's column (the user's call, 20 Oct 2026).
    expect(screen.getByRole('heading', { level: 1 }).parentElement).not.toContainElement(banner);
    await user.click(within(banner).getByRole('link', { name: 'Review' }));
    expect(history.location.pathname).toBe('/sessions/00000000000000a1');
  });

  it('AC-26 (Q11a): with several waiting, one banner for the one waiting longest, and how many more', async () => {
    server.use(
      sessionsHandler(
        makeSessionList([
          waiting('00000000000000a3', '2026-10-18T09:30:00.000Z', { title: 'Newest', source: null }),
          waiting('00000000000000a1', '2026-10-18T09:00:00.000Z', { title: 'Oldest', source: null }),
          {
            id: '00000000000000a4',
            title: 'Working',
            state: 'working',
            source: null,
            updatedAt: '2026-10-18T08:00:00.000Z',
          },
          waiting('00000000000000a2', '2026-10-18T09:10:00.000Z', { title: 'Middle', source: null }),
        ]),
      ),
      sessionHandler(
        makeSession({
          id: '00000000000000a1',
          title: 'Oldest',
          source: null,
          state: 'needs_you',
          approvals: [
            {
              id: 'e1',
              askedAt: '2026-10-18T09:00:00.000Z',
              kind: 'edit',
              path: 'src/content/ContentList.tsx',
              creates: false,
              lines: [],
              moreLines: 0,
            },
          ],
        }),
      ),
    );
    await renderApp();

    // findByRole fails on more than one: this is the one banner.
    const banner = await screen.findByRole('status', { name: 'Claude is waiting for your approval' });
    await waitFor(() => {
      expect(banner).toHaveAccessibleDescription('Oldest · wants to edit src/content/ContentList.tsx · 2 more waiting');
    });
    expect(within(banner).getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/sessions/00000000000000a1');
  });

  it('AC-27: goes when the last waiting session is answered elsewhere, and is never there with nothing waiting', async () => {
    server.use(sessionsHandler(makeSessionList([waiting('00000000000000a1', '2026-10-18T09:00:00.000Z')])));
    await renderApp();
    expect(await screen.findByRole('status', { name: 'Claude is waiting for your approval' })).toBeVisible();

    server.use(
      sessionsHandler(
        makeSessionList([{ ...waiting('00000000000000a1', '2026-10-18T09:01:00.000Z'), state: 'working' }]),
      ),
    );
    act(() => {
      FakeEventSource.latest().emit({ type: 'sessions.changed' });
    });

    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Claude is waiting for your approval' })).toBeNull();
    });
  });

  it('is Home’s alone: other pages don’t show it', async () => {
    server.use(sessionsHandler(makeSessionList([waiting('00000000000000a1', '2026-10-18T09:00:00.000Z')])));
    await renderApp({ route: '/settings' });
    await screen.findByRole('link', { name: /Add bulk archive/ });

    expect(screen.queryByRole('status', { name: 'Claude is waiting for your approval' })).toBeNull();
  });
});
