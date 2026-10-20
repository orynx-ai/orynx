import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeSession } from '@devhub/contracts/testing';
import { server, sessionHandler } from '../../../../test/msw.ts';
import { renderApp } from '../../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const session = makeSession({
  id,
  title: 'Add bulk archive',
  state: 'working',
  source: { kind: 'jira', key: 'PROJ-1423' },
  worktreePath: '/Users/you/.devhub/worktrees/0123456789abcdef',
  terminal: true,
});

function pageBar() {
  return screen.getByRole('banner');
}

describe('SessionTerminal', () => {
  it('AC-1: Terminal opens the full-screen dialog on your shell, naming the session and its ticket', async () => {
    server.use(sessionHandler(session));
    const { user } = await renderApp({ route });

    const button = await within(pageBar()).findByRole('button', { name: 'Terminal' });
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+`');
    await user.click(button);

    const dialog = await screen.findByRole('dialog', { name: 'Terminal' });
    expect(within(dialog).getByText('Add bulk archive · PROJ-1423')).toBeVisible();
    const tabs = within(dialog).getByRole('tablist', { name: 'Terminals' });
    expect(within(tabs).getByRole('tab', { name: 'Claude' })).toHaveAttribute('aria-selected', 'false');
    expect(await within(tabs).findByRole('tab', { name: 'zsh · worktree' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-2: Back to session, Esc and ⌃` close it, and focus is back on Terminal', async () => {
    server.use(sessionHandler(session));
    const { user } = await renderApp({ route });
    const button = await within(pageBar()).findByRole('button', { name: 'Terminal' });

    await user.click(button);
    await user.click(await screen.findByRole('button', { name: 'Back to session' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    expect(button).toHaveFocus();

    await user.keyboard('{Control>}[Backquote]{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Terminal' })).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    expect(button).toHaveFocus();

    await user.keyboard('{Control>}[Backquote]{/Control}');
    await screen.findByRole('dialog', { name: 'Terminal' });
    await user.keyboard('{Control>}[Backquote]{/Control}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    expect(button).toHaveFocus();
  });

  it('AC-1: opens on the tab you last had for this session', async () => {
    server.use(sessionHandler(session));
    const { user } = await renderApp({ route });
    await user.click(await within(pageBar()).findByRole('button', { name: 'Terminal' }));
    await user.click(await screen.findByRole('tab', { name: 'Claude' }));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });

    await user.click(within(pageBar()).getByRole('button', { name: 'Terminal' }));
    expect(await screen.findByRole('tab', { name: 'Claude' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-3: a session with no Terminal has no button, and ⌃` does nothing', async () => {
    server.use(sessionHandler({ ...session, terminal: false }));
    const { user } = await renderApp({ route });
    await screen.findByRole('heading', { level: 1, name: 'Add bulk archive' });

    expect(within(pageBar()).queryByRole('button', { name: 'Terminal' })).toBeNull();
    await user.keyboard('{Control>}[Backquote]{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
  });
});
