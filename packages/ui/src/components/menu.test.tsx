import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Folder, GitBranch, Plus, Settings } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './menu.tsx';

function Folders({ onAdd = () => undefined }: { onAdd?: () => void }) {
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button>Folders</Button>
        </MenuTrigger>
        <MenuContent
          aria-label="Folders"
          foot="Tip: you can also paste a Jira key or a pull request link into the box."
        >
          <MenuLabel>On this computer</MenuLabel>
          <MenuItem icon={<Folder />} path="~/code/web-app">
            web-app
          </MenuItem>
          <MenuItem icon={<Folder />} path="~/code/api">
            api
          </MenuItem>
          <MenuItem icon={<GitBranch />} description="Pick a branch to start from" leadsOn>
            Branch
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Plus />} onSelect={onAdd}>
            Add local folder
          </MenuItem>
          <MenuItem icon={<Settings />} asChild>
            <a href="/settings/repositories">Manage folders</a>
          </MenuItem>
        </MenuContent>
      </Menu>
      <button type="button">After the menu</button>
    </>
  );
}

describe('Menu', () => {
  it('AC-6: shows its label, items with their description or mono path, a separator, a link item and a foot line', async () => {
    const user = userEvent.setup();
    const { container } = render(<Folders />);

    await user.click(screen.getByRole('button', { name: 'Folders' }));

    const menu = screen.getByRole('menu', { name: 'Folders' });
    expect(screen.getByText('On this computer')).toBeVisible();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'web-app~/code/web-app',
      'api~/code/api',
      'BranchPick a branch to start from',
      'Add local folder',
      'Manage folders',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Manage folders' })).toHaveAttribute('href', '/settings/repositories');
    // Screen readers in a menu hear only its items, so the foot line also describes the menu.
    expect(menu).toHaveAccessibleDescription('Tip: you can also paste a Jira key or a pull request link into the box.');
    // The menu renders in a portal, outside the trigger's container.
    await expectNoAxeViolations(menu);
    await expectNoAxeViolations(container);
  });

  it('AC-5: arrow keys move through the items, a letter jumps, Enter picks and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Folders onAdd={onAdd} />);

    screen.getByRole('button', { name: 'Folders' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: /^web-app/ })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /^api/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: /^web-app/ })).toHaveFocus();
    await user.keyboard('m');
    expect(screen.getByRole('menuitem', { name: 'Manage folders' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{Enter}');

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Folders' })).toHaveFocus();
  });

  it.each([
    ['Esc', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['Tab', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Tab}')],
    ['a click outside', async (user: ReturnType<typeof userEvent.setup>) => user.click(document.body)],
  ])('AC-5: %s closes the menu without picking and puts focus back on the trigger', async (_, close) => {
    // While a menu is open Radix sets pointer-events: none on the page; a real click outside still
    // reaches the page, so user-event's own check is turned off.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onAdd = vi.fn();
    render(<Folders onAdd={onAdd} />);

    screen.getByRole('button', { name: 'Folders' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu', { name: 'Folders' })).toBeVisible();

    await close(user);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Folders' })).toHaveFocus();
  });
});
