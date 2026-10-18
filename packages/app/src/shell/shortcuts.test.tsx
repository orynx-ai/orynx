import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../test/render.tsx';

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

/** Presses a key combination the way the browser delivers it; returns false if the page blocked the browser's own action. */
function press(init: KeyboardEventInit, target: Element = document.body): boolean {
  return fireEvent.keyDown(target, { bubbles: true, cancelable: true, ...init });
}

const optionCommandN = { key: 'n', code: 'KeyN', metaKey: true, altKey: true };

afterEach(() => {
  document.querySelectorAll('[data-outside-app]').forEach((node) => {
    node.remove();
  });
});

describe('New task', () => {
  it('AC-5: clicking it opens Home and moves focus to the main region', async () => {
    const { user, history } = await renderApp({ route: '/tickets' });

    await user.click(within(mainNav()).getByRole('link', { name: /^New task/ }));

    expect(history.location.pathname).toBe('/');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('AC-6: ⌥⌘N opens Home from any page and blocks the browser’s own action', async () => {
    const { history } = await renderApp({ route: '/settings/appearance' });

    expect(press(optionCommandN)).toBe(false);

    await screen.findByRole('heading', { name: 'What should we build today?' });
    expect(history.location.pathname).toBe('/');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('AC-6: works while typing in a text field', async () => {
    const { history } = await renderApp({ route: '/tickets' });
    const field = document.createElement('input');
    field.dataset['outsideApp'] = '';
    document.body.append(field);
    field.focus();

    press(optionCommandN, field);

    await screen.findByRole('heading', { name: 'What should we build today?' });
    expect(history.location.pathname).toBe('/');
  });

  it('AC-6: shows ⌥⌘N in the sidebar and names it for screen readers on a Mac', async () => {
    await renderApp();
    const newTask = within(mainNav()).getByRole('link', { name: /^New task/ });

    expect(within(newTask).getByText('⌥⌘N')).toBeVisible();
    expect(newTask).toHaveAttribute('aria-keyshortcuts', 'Alt+Meta+N');
  });

  it('AC-6: leaves ⌘N to the browser, which keeps it for a new window', async () => {
    const { history } = await renderApp({ route: '/tickets' });

    expect(press({ key: 'n', code: 'KeyN', metaKey: true })).toBe(true);
    expect(history.location.pathname).toBe('/tickets');
  });

  it('AC-6: uses Ctrl+Alt+N and shows it that way off macOS', async () => {
    const { history } = await renderApp({ route: '/tickets', platform: { os: 'other' } });
    const newTask = within(mainNav()).getByRole('link', { name: /^New task/ });
    expect(within(newTask).getByText('Ctrl+Alt+N')).toBeVisible();
    expect(newTask).toHaveAttribute('aria-keyshortcuts', 'Control+Alt+N');

    press(optionCommandN);
    expect(history.location.pathname).toBe('/tickets');

    expect(press({ key: 'n', code: 'KeyN', ctrlKey: true, altKey: true })).toBe(false);
    await screen.findByRole('heading', { name: 'What should we build today?' });
  });

  it('AC-6: leaves AltGr+N alone, because it types a letter on some keyboards', async () => {
    const { history } = await renderApp({ route: '/tickets', platform: { os: 'other' } });

    const event = new KeyboardEvent('keydown', {
      key: 'ń',
      code: 'KeyN',
      ctrlKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
      modifierAltGraph: true,
    });
    expect(document.body.dispatchEvent(event)).toBe(true);
    expect(history.location.pathname).toBe('/tickets');
  });

  it('AC-6: uses ⌘N in the desktop app, where the page gets every key', async () => {
    const { history } = await renderApp({ route: '/tickets', platform: { kind: 'desktop' } });
    expect(within(mainNav()).getByText('⌘N')).toBeVisible();

    expect(press({ key: 'n', code: 'KeyN', metaKey: true })).toBe(false);
    await screen.findByRole('heading', { name: 'What should we build today?' });
    expect(history.location.pathname).toBe('/');
  });
});

describe('New task on Home', () => {
  it('AC-1: is never marked as the current page; only the Home place is', async () => {
    await renderApp({ route: '/' });
    const nav = mainNav();

    expect(within(nav).getByRole('link', { name: /^New task/ })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Search', () => {
  const commandK = { key: 'k', code: 'KeyK', metaKey: true };

  function searchBox() {
    return screen.getByRole('combobox', { name: 'Search tickets, pull requests and sessions' });
  }

  it('AC-1: ⌘K opens Search from any page, with focus in its box, and blocks the browser’s own action', async () => {
    const { history } = await renderApp({ route: '/tickets' });

    expect(press(commandK)).toBe(false);

    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeVisible();
    expect(searchBox()).toHaveFocus();
    expect(history.location.pathname).toBe('/tickets');
  });

  it('AC-19: ⌘K again closes it', async () => {
    await renderApp({ route: '/tickets' });
    press(commandK);
    await screen.findByRole('dialog', { name: 'Search' });

    press(commandK, searchBox());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-3: works while typing in a text field, and gives focus back to it, with its text, on Esc', async () => {
    const { user } = await renderApp({ route: '/tickets' });
    const field = document.createElement('input');
    field.dataset['outsideApp'] = '';
    document.body.append(field);
    field.focus();
    await user.keyboard('archive');

    press(commandK, field);
    await screen.findByRole('dialog', { name: 'Search' });
    await user.keyboard('{Escape}');

    expect(field).toHaveFocus();
    expect(field).toHaveValue('archive');
  });

  it('AC-2: uses Ctrl+K off macOS, shows it that way, and leaves the Windows key alone', async () => {
    await renderApp({ platform: { os: 'other' } });
    const search = within(mainNav()).getByRole('button', { name: /Search/ });
    expect(within(search).getByText('Ctrl+K')).toBeVisible();
    expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K');

    expect(press(commandK)).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(press({ key: 'k', code: 'KeyK', ctrlKey: true })).toBe(false);
    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeVisible();
  });

  it('AC-1: leaves ⇧⌘K to the browser', async () => {
    await renderApp();

    expect(press({ ...commandK, shiftKey: true })).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
