import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render.tsx';
import { mainNav, openSessionMenu, serveSessions } from '../../../test/sessions.ts';
import { http, HttpResponse } from 'msw';
import { apiRoutes } from '@devhub/contracts';
import { makeSession, makeSessionChanges, makeSessionPort } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';

describe('Delete session (spec 039)', () => {
  it('AC-31: Delete asks first; Cancel keeps it and gives focus back to ⋯', async () => {
    const { deleted } = serveSessions([{ id: '0123456789abcdef', title: 'Add bulk archive', state: 'stopped' }]);
    server.use(http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())));
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');

    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this session?' });
    expect(await within(dialog).findByText(/Its changes that haven’t been pushed will be lost\./)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(deleted).toEqual([]);
    await waitFor(() => {
      expect(within(mainNav()).getByRole('button', { name: 'More actions for Add bulk archive' })).toHaveFocus();
    });
  });

  it('AC-32: Delete deletes it, the row goes, and focus moves to View all', async () => {
    const { deleted } = serveSessions([
      { id: '0123456789abcdef', title: 'Add bulk archive', state: 'stopped' },
      { title: 'Tidy the README', state: 'done' },
    ]);
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this session?' });

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(within(mainNav()).queryByRole('link', { name: /^Add bulk archive/ })).not.toBeInTheDocument();
    });
    expect(deleted).toEqual(['0123456789abcdef']);
    expect(within(mainNav()).getByRole('link', { name: /^Tidy the README/ })).toBeVisible();
    await waitFor(() => {
      expect(within(mainNav()).getByRole('link', { name: 'View all' })).toHaveFocus();
    });
  });

  it('AC-33: while Claude works, Delete is there but disabled, and says why', async () => {
    serveSessions([{ title: 'Add bulk archive', state: 'working' }]);
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');

    const remove = within(menu).getByRole('menuitem', { name: /^Delete/ });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveTextContent('Stop the session first');
  });

  it('AC-32: the branch goes too only when its box is ticked; it took Discard changes’ place', async () => {
    serveSessions([{ id: '0123456789abcdef', title: 'Add bulk archive', state: 'stopped' }]);
    const asked: string[] = [];
    server.use(
      sessionHandler(makeSession({ id: '0123456789abcdef', state: 'stopped', branch: 'feat/PROJ-1423' })),
      http.delete(apiUrl(apiRoutes.session), ({ request }) => {
        asked.push(new URL(request.url).search);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this session?' });

    const branch = await within(dialog).findByRole('checkbox', { name: 'Also delete the branch feat/PROJ-1423' });
    expect(branch).not.toBeChecked();
    await user.click(branch);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(asked).toEqual(['?branch=true']);
    });
  });

  it('AC-13 (spec 042): says which servers deleting it stops', async () => {
    serveSessions([{ id: '0123456789abcdef', title: 'Add bulk archive', state: 'stopped' }]);
    server.use(
      sessionHandler(makeSession({ id: '0123456789abcdef', state: 'stopped', terminal: true, worktreePath: '/w' })),
      http.get(apiUrl(apiRoutes.sessionPorts), () => HttpResponse.json({ ports: [makeSessionPort()] })),
    );
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this session?' });
    expect(await within(dialog).findByText(/Stops 1 server \(localhost:3005\)\./)).toBeVisible();
  });
});
