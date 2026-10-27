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

/** Terminal in the page bar (spec 048). */
async function openTerminal(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  const button = await within(pageBar()).findByRole('button', { name: /^Terminal/ });
  await user.click(button);
  return button;
}

describe('SessionTerminal', () => {
  it('AC-1 (038), AC-8 (spec 048): Terminal is in the page bar with its shortcut, and opens the dialog on your shell', async () => {
    server.use(sessionHandler(session));
    const { user } = await renderApp({ route });
    await screen.findByRole('heading', { level: 1, name: 'Add bulk archive' });

    const button = await openTerminal(user);
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+`');

    const dialog = await screen.findByRole('dialog', { name: 'Terminal' });
    expect(within(dialog).getByText('Add bulk archive · PROJ-1423')).toBeVisible();
    const tabs = within(dialog).getByRole('tablist', { name: 'Terminals' });
    expect(within(tabs).getByRole('tab', { name: 'Claude' })).toHaveAttribute('aria-selected', 'false');
    expect(await within(tabs).findByRole('tab', { name: 'zsh · worktree' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-2: Close terminal, Esc outside your shell, and ⌃` close it, and focus is back on Terminal', async () => {
    server.use(sessionHandler(session));
    const { user } = await renderApp({ route });
    const terminal = await openTerminal(user);
    await user.click(await screen.findByRole('button', { name: 'Close terminal' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    expect(terminal).toHaveFocus();

    await user.keyboard('{Control>}[Backquote]{/Control}');
    await user.click(await screen.findByRole('tab', { name: 'Claude' }));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    expect(terminal).toHaveFocus();

    await user.keyboard('{Control>}[Backquote]{/Control}');
    await screen.findByRole('dialog', { name: 'Terminal' });
    await user.keyboard('{Control>}[Backquote]{/Control}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });
    expect(terminal).toHaveFocus();
  });

  it('AC-1: opens on the tab you last had for this session', async () => {
    server.use(sessionHandler(session));
    const { user } = await renderApp({ route });
    await openTerminal(user);
    await user.click(await screen.findByRole('tab', { name: 'Claude' }));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
    });

    await openTerminal(user);
    expect(await screen.findByRole('tab', { name: 'Claude' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-3: a session with no Terminal has no button or item, and ⌃` does nothing', async () => {
    server.use(sessionHandler({ ...session, terminal: false }));
    const { user } = await renderApp({ route });
    await screen.findByRole('heading', { level: 1, name: 'Add bulk archive' });
    expect(within(pageBar()).queryByRole('button', { name: /^Terminal/ })).toBeNull();

    await user.click(within(pageBar()).getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Open in VS Code' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Terminal' })).toBeNull();
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}[Backquote]{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Terminal' })).toBeNull();
  });
});
