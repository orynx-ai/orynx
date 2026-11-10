import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStandup } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

async function open() {
  const app = await renderApp({ route: '/' });
  const chip = await screen.findByRole('button', { name: 'Write my standup' });
  await app.user.click(chip);
  return { ...app, chip, dialog: await screen.findByRole('dialog', { name: 'Your standup' }) };
}

describe('Write my standup (spec 057, C)', () => {
  it('AC-27, AC-33: opens with the draft in an editable box that has focus', async () => {
    server.use(http.get(apiUrl(apiRoutes.standup), () => HttpResponse.json(makeStandup())));
    const { dialog } = await open();

    const box = await within(dialog).findByRole('textbox', { name: 'Your standup' });
    expect(box).toHaveValue(makeStandup().text);
    await waitFor(() => {
      expect(box).toHaveFocus();
    });
  });

  it('AC-27: shows skeleton lines while it drafts', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.standup), async () => {
        await delay('infinite');
        return HttpResponse.json(makeStandup());
      }),
    );
    const { dialog } = await open();
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
  });

  it('AC-32: what you edit is what Copy copies, and nothing is posted', async () => {
    const posted: string[] = [];
    server.use(
      http.get(apiUrl(apiRoutes.standup), () => HttpResponse.json(makeStandup())),
      http.post(apiUrl('/api/*'), ({ request }) => {
        posted.push(request.url);
        return HttpResponse.json({});
      }),
    );
    const { user, dialog } = await open();
    const box = await within(dialog).findByRole('textbox', { name: 'Your standup' });

    await user.clear(box);
    await user.type(box, 'Yesterday{Enter}• Shipped it');
    await user.click(within(dialog).getByRole('button', { name: 'Copy your standup' }));

    expect(await navigator.clipboard.readText()).toBe('Yesterday\n• Shipped it');
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeVisible();
    expect(posted).toEqual([]);
  });

  it('AC-31: a source it couldn’t read says so under the box', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.standup), () => HttpResponse.json(makeStandup({ missing: ['jira', 'github'] }))),
    );
    const { dialog } = await open();
    expect(await within(dialog).findByText("Couldn't read Jira, so Jira moves are missing.")).toBeVisible();
    expect(within(dialog).getByText("Couldn't read GitHub, so merged pull requests are missing.")).toBeVisible();
  });

  it('AC-33: Escape closes it, and focus goes back to the chip', async () => {
    server.use(http.get(apiUrl(apiRoutes.standup), () => HttpResponse.json(makeStandup())));
    const { user, dialog, chip } = await open();
    await within(dialog).findByRole('textbox', { name: 'Your standup' });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Your standup' })).toBeNull();
    });
    expect(chip).toHaveFocus();
  });

  it("says when it couldn't draft, and Try again drafts again", async () => {
    let asked = 0;
    server.use(
      http.get(apiUrl(apiRoutes.standup), () => {
        asked += 1;
        return asked === 1
          ? HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 })
          : HttpResponse.json(makeStandup());
      }),
    );
    const { user, dialog } = await open();
    expect(await within(dialog).findByText("Couldn't draft your standup.")).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByRole('textbox', { name: 'Your standup' })).toBeVisible();
  });
});
