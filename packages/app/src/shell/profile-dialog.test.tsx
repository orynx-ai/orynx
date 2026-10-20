import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { useProfileStore } from '../stores/profile-store.ts';
import { apiUrl, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

/** Opens Edit profile the way a person does: the footer, then their own row in the menu. */
async function openEditProfile(name = 'Rakesh Dhariwal') {
  server.use(http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ user: { name } }))));
  const rendered = await renderApp();
  const nav = screen.getByRole('navigation', { name: 'Main' });
  await rendered.user.click(await within(nav).findByRole('button', { name: /^Profile: / }));
  // The first row is the person, then their bio, or "Edit profile" while they have none.
  await rendered.user.keyboard('{ArrowDown}{Enter}');
  return { ...rendered, nav, dialog: await screen.findByRole('dialog', { name: 'Edit profile' }) };
}

describe('Edit profile', () => {
  it('saves a name and bio in this browser, and the sidebar shows them at once', async () => {
    const { user, nav, dialog } = await openEditProfile();
    const name = within(dialog).getByRole('textbox', { name: 'Name' });

    await user.clear(name);
    await user.type(name, 'Ada Lovelace');
    await user.type(within(dialog).getByRole('textbox', { name: 'Bio' }), 'Writes the first program');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    const footer = within(nav).getByRole('button', { name: 'Profile: Ada Lovelace Writes the first program' });
    expect(within(footer).getByText('AL')).toBeVisible();
    expect(JSON.parse(localStorage.getItem('devhub.profile') ?? '{}')).toMatchObject({
      state: { name: 'Ada Lovelace', bio: 'Writes the first program', picture: null },
    });
    await user.click(footer);
    expect(screen.getByRole('menuitem', { name: 'Ada Lovelace Writes the first program' })).toBeVisible();
  });

  it('opens with the saved name, and an emptied name goes back to the one the server knows', async () => {
    useProfileStore.setState({ name: 'Ada Lovelace' });
    const { user, nav, dialog } = await openEditProfile();
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Ada Lovelace');
    expect(within(dialog).getByText('Leave it empty to use Rakesh Dhariwal.')).toBeVisible();

    await user.clear(name);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(nav).getByRole('button', { name: 'Profile: Rakesh Dhariwal' })).toBeVisible();
  });

  it('keeps what was saved when Cancel closes it', async () => {
    useProfileStore.setState({ bio: 'Before' });
    const { user, dialog } = await openEditProfile();

    await user.type(within(dialog).getByRole('textbox', { name: 'Bio' }), ' and after');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useProfileStore.getState().bio).toBe('Before');
  });

  it('says when the bio is too long, and saves nothing', async () => {
    const { user, dialog } = await openEditProfile();
    const bio = within(dialog).getByRole('textbox', { name: 'Bio' });

    await user.click(bio);
    await user.paste('a'.repeat(161));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(bio).toHaveAccessibleDescription('Keep the bio to 160 characters.');
    expect(useProfileStore.getState().bio).toBe('');
  });

  it('says when a file is not a picture it can read', async () => {
    const { user, dialog } = await openEditProfile();

    await user.upload(
      within(dialog).getByLabelText('Add picture'),
      new File(['not really a picture'], 'me.png', { type: 'image/png' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That file isn't a picture Orynx can read.");
  });

  it('removes a saved picture, so the initials come back', async () => {
    useProfileStore.setState({ picture: 'data:image/png;base64,AAAA' });
    const { user, nav, dialog } = await openEditProfile();
    expect(within(dialog).getByLabelText('Change picture')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(within(dialog).getByLabelText('Add picture')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(useProfileStore.getState().picture).toBeNull();
    expect(within(nav).getByText('RD')).toBeVisible();
  });
});
