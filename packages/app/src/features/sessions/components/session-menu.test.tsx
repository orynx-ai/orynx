import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { mainNav, openSessionMenu, serveSessions } from '../../../test/sessions.ts';

describe('a session’s ⋯ menu in the sidebar (spec 039)', () => {
  it('AC-24, AC-25: every row has its own ⋯, beside the link, with Rename, Pin and Delete', async () => {
    serveSessions([
      { title: 'Add bulk archive', state: 'done' },
      { title: 'Tidy the README', state: 'stopped' },
    ]);
    const { user } = await renderApp();

    const link = await within(mainNav()).findByRole('link', { name: /^Add bulk archive/ });
    const more = within(mainNav()).getByRole('button', { name: 'More actions for Add bulk archive' });
    expect(link).not.toContainElement(more);
    expect(within(mainNav()).getByRole('button', { name: 'More actions for Tidy the README' })).toBeInTheDocument();

    const { menu } = await openSessionMenu(user, 'Add bulk archive');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Rename', 'Pin', 'Copy link', 'Delete']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
  });

  it('Copy link puts the session’s address on the clipboard, and says so (the user’s call, 22 Oct 2026)', async () => {
    serveSessions([{ id: '0123456789abcdef', title: 'Add bulk archive', state: 'done' }]);
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');

    await user.click(within(menu).getByRole('menuitem', { name: 'Copy link' }));

    expect(await within(mainNav()).findByRole('status')).toHaveTextContent('Link copied');
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/sessions/0123456789abcdef`);
  });

  it('AC-26: Pin pins it, and its menu then says Unpin', async () => {
    const { patched } = serveSessions([{ title: 'Add bulk archive', state: 'done' }]);
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');

    await user.click(within(menu).getByRole('menuitem', { name: 'Pin' }));

    await waitFor(() => {
      expect(patched).toEqual([{ pinned: true }]);
    });
    await user.click(within(mainNav()).getByRole('button', { name: 'More actions for Add bulk archive' }));
    expect(await screen.findByRole('menuitem', { name: 'Unpin' })).toBeVisible();
  });

  it('a running session’s ⋯ starts with Stop, which stops it (the user’s call, 20 Oct 2026)', async () => {
    serveSessions([
      { id: 'session-working', title: 'Add bulk archive', state: 'working' },
      { title: 'Tidy the README', state: 'done' },
    ]);
    const stopped: string[] = [];
    server.use(
      http.post(apiUrl(apiRoutes.sessionStop), ({ params }) => {
        stopped.push(String(params['id']));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp();

    const { menu } = await openSessionMenu(user, 'Add bulk archive');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Stop', 'Rename', 'Pin', 'Copy link', 'DeleteStop the session first']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Stop' }));
    await waitFor(() => {
      expect(stopped).toEqual(['session-working']);
    });

    await user.click(within(mainNav()).getByRole('button', { name: 'More actions for Tidy the README' }));
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Stop' })).toBeNull();
  });
});
