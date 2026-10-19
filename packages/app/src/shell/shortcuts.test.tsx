import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useComposerStore } from '../features/home/store.ts';
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

describe('The New task shortcut', () => {
  it('AC-6: ⌥⌘N opens Home from any page and blocks the browser’s own action', async () => {
    const { history } = await renderApp({ route: '/settings/appearance' });

    expect(press(optionCommandN)).toBe(false);

    await screen.findByRole('heading', { name: 'What should we build today?' });
    expect(history.location.pathname).toBe('/');
    // Spec 015, AC-2: in the composer, with the draft kept.
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Describe a task for Claude' })).toHaveFocus();
    });
  });

  it('AC-2 (spec 015): puts focus in the composer on Home too, with what was typed still there', async () => {
    useComposerStore.setState({ text: 'Fix the header' });
    await renderApp();
    const box = await screen.findByRole('textbox', { name: 'Describe a task for Claude' });

    press(optionCommandN);

    await waitFor(() => {
      expect(box).toHaveFocus();
    });
    expect(box).toHaveValue('Fix the header');
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

  it('AC-6: names ⌥⌘N for screen readers on a Mac, on Home, where it goes (spec 020, AC-8)', async () => {
    await renderApp();

    expect(within(mainNav()).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-keyshortcuts', 'Alt+Meta+N');
  });

  it('AC-6: leaves ⌘N to the browser, which keeps it for a new window', async () => {
    const { history } = await renderApp({ route: '/tickets' });

    expect(press({ key: 'n', code: 'KeyN', metaKey: true })).toBe(true);
    expect(history.location.pathname).toBe('/tickets');
  });

  it('AC-6: uses Ctrl+Alt+N off macOS', async () => {
    const { history } = await renderApp({ route: '/tickets', platform: { os: 'other' } });
    expect(within(mainNav()).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-keyshortcuts', 'Control+Alt+N');

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
    expect(within(mainNav()).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-keyshortcuts', 'Meta+N');

    expect(press({ key: 'n', code: 'KeyN', metaKey: true })).toBe(false);
    await screen.findByRole('heading', { name: 'What should we build today?' });
    expect(history.location.pathname).toBe('/');
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

  it('AC-19: holding ⌘K down opens search once, rather than opening and closing it with each repeat', async () => {
    await renderApp();

    press(commandK);
    await screen.findByRole('dialog', { name: 'Search' });
    expect(press({ ...commandK, repeat: true }, searchBox())).toBe(false);
    press({ ...commandK, repeat: true }, searchBox());

    expect(screen.getByRole('dialog', { name: 'Search' })).toBeVisible();
  });

  it('AC-1: leaves ⇧⌘K to the browser', async () => {
    await renderApp();

    expect(press({ ...commandK, shiftKey: true })).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
