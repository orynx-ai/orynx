import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render.tsx';

function openSearch(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  return user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /Search/ }));
}

function searchBox() {
  return screen.getByRole('combobox', { name: 'Search tickets, pull requests and sessions' });
}

describe('Search dialog', () => {
  it('AC-5: before anything is typed it shows the hint line and no results', async () => {
    const { user } = await renderApp();

    await openSearch(user);

    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(searchBox()).toHaveAttribute('placeholder', 'Search tickets, pull requests and sessions');
    expect(
      within(dialog).getByText('Find a ticket by key or title, a pull request by number or repository, or a session.'),
    ).toBeVisible();
    expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('AC-19: opens empty every time: the text typed is dropped when it closes', async () => {
    const { user } = await renderApp();
    await openSearch(user);
    await user.type(await screen.findByRole('combobox'), 'archive');

    await user.keyboard('{Escape}');
    await openSearch(user);

    expect(searchBox()).toHaveValue('');
  });

  it('AC-20: Tab stays inside the dialog', async () => {
    const { user } = await renderApp();
    await openSearch(user);
    await screen.findByRole('dialog', { name: 'Search' });

    await user.tab();
    expect(searchBox()).toHaveFocus();
    await user.tab({ shift: true });
    expect(searchBox()).toHaveFocus();
  });
});
