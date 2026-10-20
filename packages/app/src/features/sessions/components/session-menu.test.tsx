import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    ).toEqual(['Rename', 'Pin', 'Delete']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
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
});
