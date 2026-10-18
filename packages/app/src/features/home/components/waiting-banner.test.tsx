import { act, screen, waitFor } from '@testing-library/react';
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
  it('AC-25: names the session, what Claude wants to run, and opens the session as one link', async () => {
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

    const banner = await screen.findByRole('link', { name: /Claude is waiting for your approval/ });
    await waitFor(() => {
      expect(banner).toHaveTextContent('PROJ-1423 · Add bulk archive · wants to run npm test');
    });
    expect(banner).toHaveTextContent('Review');
    await user.click(banner);
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

    const banners = await screen.findAllByRole('link', { name: /Claude is waiting for your approval/ });
    expect(banners).toHaveLength(1);
    await waitFor(() => {
      expect(banners[0]).toHaveTextContent('Oldest · wants to edit src/content/ContentList.tsx · 2 more waiting');
    });
    expect(banners[0]).toHaveAttribute('href', '/sessions/00000000000000a1');
  });

  it('AC-27: goes when the last waiting session is answered elsewhere, and is never there with nothing waiting', async () => {
    server.use(sessionsHandler(makeSessionList([waiting('00000000000000a1', '2026-10-18T09:00:00.000Z')])));
    await renderApp();
    expect(await screen.findByRole('link', { name: /Claude is waiting for your approval/ })).toBeVisible();

    server.use(
      sessionsHandler(
        makeSessionList([{ ...waiting('00000000000000a1', '2026-10-18T09:01:00.000Z'), state: 'working' }]),
      ),
    );
    act(() => {
      FakeEventSource.latest().emit({ type: 'sessions.changed' });
    });

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Claude is waiting for your approval/ })).toBeNull();
    });
  });
});
