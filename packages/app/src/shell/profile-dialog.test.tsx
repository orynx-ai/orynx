import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { apiUrl, serveProfile, server } from '../test/msw.ts';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Edit profile', () => {
  it('AC-6: saves a name and bio on the server, and the sidebar shows them at once', async () => {
    const profile = serveProfile();
    const { user, nav, dialog } = await openEditProfile();
    const name = within(dialog).getByRole('textbox', { name: 'Name' });

    await user.clear(name);
    await user.type(name, 'Ada Lovelace');
    await user.type(within(dialog).getByRole('textbox', { name: 'Bio' }), 'Writes the first program');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const footer = within(nav).getByRole('button', { name: 'Profile: Ada Lovelace Writes the first program' });
    expect(within(footer).getByText('AL')).toBeVisible();
    expect(profile.saved).toEqual({ name: 'Ada Lovelace', bio: 'Writes the first program', picture: null });
    expect(screen.queryByText('Saved in this browser only.')).toBeNull();
    await user.click(footer);
    expect(screen.getByRole('menuitem', { name: 'Ada Lovelace Writes the first program' })).toBeVisible();
  });

  it('opens with the saved name, and an emptied name goes back to the one the server knows', async () => {
    serveProfile({ name: 'Ada Lovelace' });
    const { user, nav, dialog } = await openEditProfile();
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Ada Lovelace');
    expect(within(dialog).getByText('Leave it empty to use Rakesh Dhariwal.')).toBeVisible();

    await user.clear(name);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(nav).findByRole('button', { name: 'Profile: Rakesh Dhariwal' })).toBeVisible();
  });

  it('keeps what was saved when Cancel closes it', async () => {
    const profile = serveProfile({ bio: 'Before' });
    const { user, dialog } = await openEditProfile();

    await user.type(within(dialog).getByRole('textbox', { name: 'Bio' }), ' and after');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(profile.saved.bio).toBe('Before');
  });

  it('says when the bio is too long, and saves nothing', async () => {
    const profile = serveProfile();
    const { user, dialog } = await openEditProfile();
    const bio = within(dialog).getByRole('textbox', { name: 'Bio' });

    await user.click(bio);
    await user.paste('a'.repeat(161));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(bio).toHaveAccessibleDescription('Keep the bio to 160 characters.');
    expect(profile.saved.bio).toBe('');
  });

  it('says when a file is not a picture it can read', async () => {
    const { user, dialog } = await openEditProfile();

    await user.upload(
      within(dialog).getByLabelText('Add picture'),
      new File(['not really a picture'], 'me.png', { type: 'image/png' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That file isn't a picture Orynx can read.");
  });

  it('opens Crop picture over it for a picked file; Escape closes the crop alone', async () => {
    // jsdom decodes no pictures: the browser's own calls stand in (the real crop is in e2e/smoke.spec.ts).
    vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 2, height: 1, close: vi.fn() }));
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, { createObjectURL: () => 'blob:me', revokeObjectURL: vi.fn() }),
    );
    const { user, dialog } = await openEditProfile();

    await user.upload(
      within(dialog).getByLabelText('Add picture'),
      new File(['pixels'], 'me.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Crop picture' })).toBeVisible();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Crop picture' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeVisible();
    expect(within(dialog).getByLabelText('Add picture')).toHaveFocus();
  });

  it('removes a saved picture, so the initials come back', async () => {
    const profile = serveProfile({ picture: 'data:image/png;base64,AAAA' });
    const { user, nav, dialog } = await openEditProfile();
    expect(within(dialog).getByLabelText('Change picture')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Remove picture' }));
    expect(within(dialog).getByLabelText('Add picture')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(nav).findByText('RD')).toBeVisible();
    expect(profile.saved.picture).toBeNull();
  });
});

describe('Edit profile › Change password', () => {
  it('is closed at first; opened, it changes the password first and then saves the profile', async () => {
    const profile = serveProfile();
    const sent: unknown[] = [];
    server.use(
      http.put(apiUrl(apiRoutes.password), async ({ request }) => {
        sent.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, dialog } = await openEditProfile();
    expect(within(dialog).queryByLabelText('Current password')).toBeNull();

    const toggle = within(dialog).getByRole('button', { name: 'Change password' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.type(within(dialog).getByLabelText('Current password'), 'correct horse battery');
    await user.type(within(dialog).getByLabelText('New password'), 'battery staple horse');
    await user.type(within(dialog).getByRole('textbox', { name: 'Bio' }), 'Ships');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent).toEqual([{ current: 'correct horse battery', next: 'battery staple horse' }]);
    expect(profile.saved.bio).toBe('Ships');
  });

  it('says on its field when the current password is wrong, stays open and saves nothing', async () => {
    const profile = serveProfile();
    server.use(
      http.put(apiUrl(apiRoutes.password), () =>
        HttpResponse.json({ code: 'wrong_password', message: 'That isn’t your current password.' }, { status: 400 }),
      ),
    );
    const { user, dialog } = await openEditProfile();

    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    await user.type(within(dialog).getByLabelText('Current password'), 'not my password');
    await user.type(within(dialog).getByLabelText('New password'), 'battery staple horse');
    await user.type(within(dialog).getByRole('textbox', { name: 'Bio' }), 'Ships');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const current = within(dialog).getByLabelText('Current password');
    await waitFor(() => {
      expect(current).toHaveAccessibleDescription('That isn’t your current password.');
    });
    expect(current).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeVisible();
    expect(profile.saved.bio).toBe('');
  });

  it('wants the current password and a long enough new one before it sends anything', async () => {
    const { user, dialog } = await openEditProfile();

    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    await user.type(within(dialog).getByLabelText('New password'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(dialog).getByLabelText('Current password')).toHaveAccessibleDescription(
      'Enter your current password.',
    );
    expect(within(dialog).getByLabelText('New password')).toHaveAccessibleDescription(
      expect.stringContaining('Use at least 8 characters.'),
    );
  });
});

describe('Edit profile when the server fails (spec 043)', () => {
  it('AC-6: says why the profile was not saved, and stays open', async () => {
    server.use(
      http.put(apiUrl(apiRoutes.profile), () =>
        HttpResponse.json({ code: 'internal', message: 'Orynx couldn’t save settings.json.' }, { status: 500 }),
      ),
    );
    const { user, dialog } = await openEditProfile();

    await user.type(within(dialog).getByRole('textbox', { name: 'Bio' }), 'Ships on Fridays');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Orynx couldn’t save settings.json.');
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeVisible();
  });
});
