import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render.tsx';
import { mainNav, openSessionMenu, serveSessions } from '../../../test/sessions.ts';

describe('Rename session (spec 039)', () => {
  it('AC-28: Rename saves the new name, and the row shows it; focus goes back to ⋯', async () => {
    const { patched } = serveSessions([{ title: 'Add bulk archive', state: 'done' }]);
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');

    await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename session' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Add bulk archive');
    await user.clear(name);
    await user.type(name, 'Fix the login page');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Rename session' })).not.toBeInTheDocument();
    });
    expect(patched).toEqual([{ title: 'Fix the login page' }]);
    expect(await within(mainNav()).findByRole('link', { name: /^Fix the login page/ })).toBeVisible();
    await waitFor(() => {
      expect(within(mainNav()).getByRole('button', { name: 'More actions for Fix the login page' })).toHaveFocus();
    });
  });

  it('AC-29: a name of only spaces is refused, and nothing is saved', async () => {
    const { patched } = serveSessions([{ title: 'Add bulk archive', state: 'done' }]);
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');
    await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename session' });

    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Give the session a name')).toBeVisible();
    expect(patched).toEqual([]);
  });

  it('AC-30: a save that fails keeps the dialog open with your text', async () => {
    serveSessions([{ title: 'Add bulk archive', state: 'done' }], { failPatch: true });
    const { user } = await renderApp();
    const { menu } = await openSessionMenu(user, 'Add bulk archive');
    await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename session' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' now');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t save the name. Try again.');
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Add bulk archive now');
  });
});
