import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Folder } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from './menu.tsx';
import { Picker } from './picker.tsx';

function RepositoryPicker({ onPick }: { onPick?: (folder: string) => void }) {
  const [folder, setFolder] = useState('web-app');
  return (
    <Menu>
      <MenuTrigger asChild>
        <Picker icon={<Folder />}>{folder}</Picker>
      </MenuTrigger>
      <MenuContent aria-label="Repository">
        <MenuLabel>On this computer</MenuLabel>
        <MenuRadioGroup
          value={folder}
          onValueChange={(next) => {
            setFolder(next);
            onPick?.(next);
          }}
        >
          <MenuRadioItem value="web-app" icon={<Folder />} path="~/code/web-app">
            web-app
          </MenuRadioItem>
          <MenuRadioItem value="api" icon={<Folder />} path="~/code/api">
            api
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

describe('Picker', () => {
  it('AC-4: shows the current choice and says it opens a menu', async () => {
    const { container } = render(<RepositoryPicker />);

    const picker = screen.getByRole('button', { name: 'web-app' });
    expect(picker).toHaveAttribute('aria-haspopup', 'menu');
    expect(picker).toHaveAttribute('aria-expanded', 'false');
    await expectNoAxeViolations(container);
  });

  it('AC-4: opens its named menu with the checked choice marked, and focus moves into it', async () => {
    const user = userEvent.setup();
    render(<RepositoryPicker />);

    await user.click(screen.getByRole('button', { name: 'web-app' }));

    // While the menu is open, Radix hides the rest of the page from screen readers, the picker too.
    expect(screen.getByRole('button', { name: 'web-app', hidden: true })).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Repository' });
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('menuitemradio', { name: /^web-app/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /^api/ })).toHaveAttribute('aria-checked', 'false');
    await expectNoAxeViolations(menu);
  });

  it.each(['{Enter}', ' ', '{ArrowDown}'])('AC-4: %s on the picker opens the menu', async (key) => {
    const user = userEvent.setup();
    render(<RepositoryPicker />);

    screen.getByRole('button', { name: 'web-app' }).focus();
    await user.keyboard(key);

    expect(screen.getByRole('menu', { name: 'Repository' })).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: /^web-app/ })).toHaveFocus();
  });

  it('AC-5: picking another choice with the keyboard checks it, closes the menu and returns focus', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<RepositoryPicker onPick={onPick} />);

    screen.getByRole('button', { name: 'web-app' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onPick).toHaveBeenCalledWith('api');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'api' })).toHaveFocus();
  });

  it('shows how many options are picked in a bubble, which a screen reader hears after a middle dot', async () => {
    const { container, rerender } = render(
      <Picker variant="plain" count={2}>
        Status
      </Picker>,
    );

    expect(screen.getByRole('button', { name: 'Status · 2' })).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    await expectNoAxeViolations(container);

    rerender(
      <Picker variant="plain" count={0}>
        Status
      </Picker>,
    );
    expect(screen.getByRole('button', { name: 'Status' })).toBeVisible();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('Q11b: a picker with nothing to offer is unavailable, out of the Tab order, and opens nothing', async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        {/* On the trigger: Radix opens its menu by its own `disabled`, and sets the button's from it. */}
        <MenuTrigger asChild disabled>
          <Picker>Reason</Picker>
        </MenuTrigger>
        <MenuContent aria-label="Reason" />
      </Menu>,
    );
    const picker = screen.getByRole('button', { name: 'Reason' });

    expect(picker).toBeDisabled();
    await user.click(picker);
    expect(screen.queryByRole('menu', { name: 'Reason' })).not.toBeInTheDocument();
  });
});
