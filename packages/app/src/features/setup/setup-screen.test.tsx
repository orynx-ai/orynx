import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SetupRequest } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';

/** A fresh Orynx: no password yet. `sent` holds every setup the page posts. */
function notSetUp({ name = 'Rakesh Dhariwal' }: { name?: string | null } = {}) {
  const sent: SetupRequest[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ user: { name } }))),
    http.get(apiUrl(apiRoutes.setup), () => HttpResponse.json({ done: sent.length > 0 })),
    http.post(apiUrl(apiRoutes.setup), async ({ request }) => {
      sent.push((await request.json()) as SetupRequest);
      return HttpResponse.json({ done: true });
    }),
  );
  return sent;
}

async function openSetup() {
  const rendered = await renderApp();
  const form = await screen.findByRole('form', { name: 'Set up Orynx' });
  return { ...rendered, form };
}

describe('Set up Orynx (spec 043)', () => {
  it('AC-1: stands in for the app, with Name filled in from the server', async () => {
    notSetUp();
    const { form } = await openSetup();

    expect(screen.getByRole('heading', { level: 1, name: 'Set up Orynx' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Rakesh Dhariwal');
    expect(within(form).getByText('RD')).toBeVisible();
    await expectNoAxeViolations(document.body);
  });

  it('AC-1: fills in the profile this browser kept before, over the server’s name', async () => {
    notSetUp();
    localStorage.setItem(
      'devhub.profile',
      JSON.stringify({ state: { name: 'Ada Lovelace', bio: 'Writes the first program', picture: null }, version: 0 }),
    );
    const { form } = await openSetup();

    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Ada Lovelace');
    expect(within(form).getByRole('textbox', { name: 'Bio' })).toHaveValue('Writes the first program');
  });

  it('AC-2: says what is wrong with each field, focuses the first, and sends nothing', async () => {
    const sent = notSetUp({ name: null });
    const { user, form } = await openSetup();
    const password = within(form).getByLabelText('Password');

    await user.type(password, 'short');
    await user.click(within(form).getByRole('button', { name: 'Finish setup' }));

    const name = within(form).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAccessibleDescription('Enter your name.');
    expect(name).toHaveFocus();
    expect(password).toHaveAccessibleDescription('Use at least 8 characters.');

    await user.type(name, 'Ada');
    await user.clear(password);
    await user.type(password, 'correct horse battery');
    await user.type(within(form).getByLabelText('Confirm password'), 'correct horse');
    await user.click(within(form).getByRole('button', { name: 'Finish setup' }));

    expect(within(form).getByLabelText('Confirm password')).toHaveAccessibleDescription('The passwords don’t match.');
    expect(sent).toEqual([]);
  });

  it('AC-3: saves the profile and the password, forgets the browser’s copy, and opens Home', async () => {
    const sent = notSetUp();
    localStorage.setItem('devhub.profile', JSON.stringify({ state: { name: '', bio: 'Ships', picture: null } }));
    const { user, form } = await openSetup();

    await user.type(within(form).getByLabelText('Password'), 'correct horse battery');
    await user.type(within(form).getByLabelText('Confirm password'), 'correct horse battery');
    await user.click(within(form).getByRole('button', { name: 'Finish setup' }));

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(sent).toEqual([
      { profile: { name: 'Rakesh Dhariwal', bio: 'Ships', picture: null }, password: 'correct horse battery' },
    ]);
    expect(localStorage.getItem('devhub.profile')).toBeNull();
    expect(await within(nav).findByRole('button', { name: 'Profile: Rakesh Dhariwal Ships' })).toBeVisible();
  });

  it('AC-4: opens the app when another tab set Orynx up first', async () => {
    notSetUp();
    server.use(
      http.post(apiUrl(apiRoutes.setup), () =>
        HttpResponse.json({ code: 'already_set_up', message: 'Orynx is set up already.' }, { status: 409 }),
      ),
    );
    const { user, form } = await openSetup();

    await user.type(within(form).getByLabelText('Password'), 'correct horse battery');
    await user.type(within(form).getByLabelText('Confirm password'), 'correct horse battery');
    await user.click(within(form).getByRole('button', { name: 'Finish setup' }));

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  it('says why setup failed, keeps what was typed, and lets the person try again', async () => {
    notSetUp();
    server.use(
      http.post(apiUrl(apiRoutes.setup), async () => {
        await delay(20);
        return HttpResponse.json({ code: 'internal', message: 'Orynx couldn’t save settings.json.' }, { status: 500 });
      }),
    );
    const { user, form } = await openSetup();

    await user.type(within(form).getByLabelText('Password'), 'correct horse battery');
    await user.type(within(form).getByLabelText('Confirm password'), 'correct horse battery');
    await user.click(within(form).getByRole('button', { name: 'Finish setup' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('Orynx couldn’t save settings.json.');
    expect(within(form).getByLabelText('Password')).toHaveValue('correct horse battery');
    expect(within(form).getByRole('button', { name: 'Finish setup' })).toBeEnabled();
  });

  it('AC-13: reaches every field and the button with Tab, in order', async () => {
    notSetUp();
    const { user, form } = await openSetup();

    const order = [
      within(form).getByLabelText('Add picture'),
      within(form).getByRole('textbox', { name: 'Name' }),
      within(form).getByRole('textbox', { name: 'Bio' }),
      within(form).getByLabelText('Password'),
      within(form).getByLabelText('Confirm password'),
      within(form).getByRole('button', { name: 'Finish setup' }),
    ];
    for (const element of order) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });
});
