import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, homeTerminalId } from '@devhub/contracts';
import { makeSession, makeTerminal } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

/** Home's shell tabs, in Orynx's home folder; a session's Terminal answers as the session's. */
function terminals() {
  return http.get(apiUrl(apiRoutes.sessionTerminal), ({ params }) =>
    HttpResponse.json(makeTerminal({ worktree: params['id'] === homeTerminalId ? '~/.devhub' : '~/worktree' })),
  );
}

function sidebar() {
  return screen.getByRole('navigation', { name: 'Main' });
}

describe('TerminalButton', () => {
  it("Terminal in the sidebar opens your shell in Orynx's home, with no Claude tab, and ⌃` closes it", async () => {
    server.use(terminals());
    const { user } = await renderApp();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Terminal' })).toBeNull();
    const button = within(sidebar()).getByRole('button', { name: 'Terminal' });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+`');
    await user.click(button);

    const dialog = await screen.findByRole('dialog', { name: 'Terminal' });
    expect(within(dialog).getByText('Orynx home')).toBeVisible();
    const tabs = within(dialog).getByRole('tablist', { name: 'Terminals' });
    expect(await within(tabs).findByRole('tab', { name: 'zsh · Orynx' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).queryByRole('tab', { name: 'Claude' })).toBeNull();
    expect(await within(dialog).findByText('~/.devhub')).toBeVisible();

    await user.keyboard('{Control>}[Backquote]{/Control}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    expect(button).toHaveFocus();
  });

  it('⌃` opens it from any page, not only Home', async () => {
    server.use(terminals());
    const { user } = await renderApp({ route: '/tickets' });

    await user.keyboard('{Control>}[Backquote]{/Control}');

    const dialog = await screen.findByRole('dialog', { name: 'Terminal' });
    expect(within(dialog).getByText('Orynx home')).toBeVisible();
  });

  it("on a Session screen ⌃` opens the session's Terminal, and the sidebar's still opens by its button", async () => {
    const id = '0123456789abcdef';
    server.use(terminals(), sessionHandler(makeSession({ id, title: 'Add bulk archive', terminal: true })));
    const { user } = await renderApp({ route: `/sessions/${id}` });
    await screen.findByRole('heading', { level: 1, name: 'Add bulk archive' });
    const button = within(sidebar()).getByRole('button', { name: 'Terminal' });
    expect(button).not.toHaveAttribute('aria-keyshortcuts');

    await user.keyboard('{Control>}[Backquote]{/Control}');
    // findByRole fails on two matches, so only the session's Terminal opened.
    const dialog = await screen.findByRole('dialog', { name: 'Terminal' });
    expect(within(dialog).getByRole('tab', { name: 'Claude' })).toBeInTheDocument();

    await user.keyboard('{Control>}[Backquote]{/Control}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    await user.click(button);
    const home = await screen.findByRole('dialog', { name: 'Terminal' });
    expect(within(home).getByText('Orynx home')).toBeVisible();
  });
});
