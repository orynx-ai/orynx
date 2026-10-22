import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { serveSessions } from '../../../test/sessions.ts';

const content = () => screen.getByRole('main');

async function pickAndDelete(user: Awaited<ReturnType<typeof renderApp>>['user'], titles: string[]) {
  await user.click(await within(content()).findByRole('button', { name: 'Select' }));
  for (const title of titles) await user.click(within(content()).getByRole('checkbox', { name: `Select ${title}` }));
  await user.click(within(content()).getByRole('button', { name: 'Delete' }));
}

describe('Delete sessions, from Select on the Sessions page (the user’s call, 22 Oct 2026)', () => {
  it('says how many it couldn’t delete, stays open, and keeps only those picked', async () => {
    const { deleted } = serveSessions([
      { title: 'Add bulk archive', state: 'done' },
      { title: 'Tidy the README', state: 'stopped' },
    ]);
    server.use(
      http.delete(apiUrl(apiRoutes.session), ({ params }) =>
        params['id'] === 'session-2'
          ? HttpResponse.json({ code: 'internal', message: 'No.' }, { status: 500 })
          : undefined,
      ),
    );
    const { user } = await renderApp({ route: '/sessions' });
    await pickAndDelete(user, ['Add bulk archive', 'Tidy the README']);

    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Delete 2 sessions?' })).getByRole('button', {
        name: 'Delete',
      }),
    );

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 1 session?' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Couldn’t delete 1 session.');
    expect(deleted).toEqual(['session-1']);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(content()).getByText('1 selected')).toBeVisible();
    expect(within(content()).getByRole('checkbox', { name: 'Select Tidy the README' })).toBeChecked();
  });

  it('once every one is gone, focus goes to Search sessions', async () => {
    serveSessions([{ title: 'Add bulk archive', state: 'done' }]);
    const { user } = await renderApp({ route: '/sessions' });
    await pickAndDelete(user, ['Add bulk archive']);

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 1 session?' });
    expect(within(dialog).getByText(/Their branches stay\./)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Search sessions' })).toHaveFocus();
    });
  });
});
