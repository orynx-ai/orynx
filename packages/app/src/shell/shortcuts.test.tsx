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

describe('Search', () => {
  it('AC-7: stays disabled until search ships, and ⌘K does nothing yet', async () => {
    const { history } = await renderApp({ route: '/tickets' });

    const search = within(mainNav()).getByRole('button', { name: /Search/ });
    expect(search).toBeDisabled();
    expect(within(search).getByText('⌘K')).toBeVisible();
    expect(press({ key: 'k', code: 'KeyK', metaKey: true })).toBe(true);
    expect(history.location.pathname).toBe('/tickets');
  });

  it('AC-7: shows Ctrl+K off macOS', async () => {
    await renderApp({ platform: { os: 'other' } });
    expect(within(mainNav()).getByText('Ctrl+K')).toBeVisible();
  });
});
