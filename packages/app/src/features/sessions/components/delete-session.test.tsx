import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render.tsx';
import { mainNav, openSessionMenu, serveSessions } from '../../../test/sessions.ts';
import { http, HttpResponse } from 'msw';
import { apiRoutes } from '@devhub/contracts';
import { makeSessionChanges } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';

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
});
