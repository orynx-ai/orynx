import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Combobox, type ComboboxOption } from './combobox.tsx';
import { Field } from './field.tsx';
import { Picker } from './picker.tsx';

const projects: ComboboxOption[] = [
  { value: '', label: 'No Jira project' },
  { value: 'MOB', label: 'MOB · Mobile' },
  { value: 'PROJ', label: 'PROJ · Intranet' },
  { value: 'WEB', label: 'WEB · Website' },
];

function Project({ start = '', disabled = false }: { start?: string; disabled?: boolean }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <Field label="Jira project" help="Tickets from this project open in this folder.">
        <Combobox
          options={projects}
          value={value}
          onValueChange={setValue}
          searchLabel="Search Jira projects"
          emptyText="No projects match"
          disabled={disabled}
        />
      </Field>
      <output>{value === '' ? 'none' : value}</output>
    </>
  );
}

describe('Combobox', () => {
  it('AC-37: is named by its field, shows the pick, and opens with focus in its search box on the pick', async () => {
    const user = userEvent.setup();
    const { container } = render(<Project start="PROJ" />);
    const field = screen.getByRole('button', { name: 'Jira project' });
    expect(field).toHaveTextContent('PROJ · Intranet');
    expect(field).toHaveAccessibleDescription('Tickets from this project open in this folder.');
    expect(field).toHaveAttribute('aria-haspopup', 'listbox');

    await user.click(field);

    const search = screen.getByRole('combobox', { name: 'Search Jira projects' });
    expect(search).toHaveFocus();
    expect(field).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox', { name: 'Search Jira projects' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(projects.map((project) => project.label));
    expect(within(list).getByRole('option', { name: 'PROJ · Intranet' })).toHaveAttribute('aria-selected', 'true');
    expect(search).toHaveAttribute(
      'aria-activedescendant',
      within(list).getByRole('option', { name: 'PROJ · Intranet' }).id,
    );
    await expectNoAxeViolations(container);
    // The list is in a portal, outside the container.
    await expectNoAxeViolations(screen.getByRole('dialog', { name: 'Search Jira projects' }));
  });

  it('AC-37: typing narrows the list by words or value; ↓ then Enter picks and closes it, focus back on the field', async () => {
    const user = userEvent.setup();
    render(<Project />);
    const field = screen.getByRole('button', { name: 'Jira project' });
    await user.click(field);

    await user.keyboard('o');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'No Jira project',
      'MOB · Mobile',
      'PROJ · Intranet',
    ]);
    await user.keyboard('b');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['MOB · Mobile']);
    await user.keyboard('{Backspace}{Backspace}web');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['WEB · Website']);
    await user.keyboard('{Backspace}{Backspace}{Backspace}{ArrowDown}{ArrowDown}{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('PROJ');
    expect(field).toHaveTextContent('PROJ · Intranet');
    expect(field).toHaveFocus();
  });

  it('AC-37: ↑ wraps to the last option, and a click picks one', async () => {
    const user = userEvent.setup();
    render(<Project />);
    await user.click(screen.getByRole('button', { name: 'Jira project' }));

    await user.keyboard('{ArrowUp}{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('WEB');

    await user.click(screen.getByRole('button', { name: 'Jira project' }));
    await user.click(screen.getByRole('option', { name: 'MOB · Mobile' }));
    expect(screen.getByRole('status')).toHaveTextContent('MOB');
  });

  it('AC-37: says when nothing matches, and Escape closes the list without a change', async () => {
    const user = userEvent.setup();
    render(<Project start="MOB" />);
    const field = screen.getByRole('button', { name: 'Jira project' });
    await user.click(field);

    await user.keyboard('zzz');
    expect(screen.getByText('No projects match')).toBeVisible();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await expectNoAxeViolations(screen.getByRole('dialog', { name: 'Search Jira projects' }));
    await user.keyboard('{Enter}{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('MOB');
    expect(field).toHaveFocus();
  });

  it('while options load, says so beside the list, and the pick stays highlighted once they arrive', async () => {
    const user = userEvent.setup();
    const opened: boolean[] = [];
    function Loading({ options, loading }: { options: ComboboxOption[]; loading: boolean }) {
      return (
        <Combobox
          options={options}
          value="WEB"
          onValueChange={() => undefined}
          searchLabel="Search projects"
          emptyText="No projects match"
          loading={loading}
          onOpenChange={(open) => opened.push(open)}
          aria-label="Project"
        />
      );
    }
    const { rerender } = render(<Loading options={projects.slice(0, 1)} loading />);
    await user.click(screen.getByRole('button', { name: 'Project' }));

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    await expectNoAxeViolations(screen.getByRole('dialog', { name: 'Search projects' }));

    rerender(<Loading options={projects} loading={false} />);
    const search = screen.getByRole('combobox', { name: 'Search projects' });
    expect(search).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'WEB · Website' }).id);
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-busy');

    await user.keyboard('{Enter}');
    expect(opened).toEqual([true, false]);
  });

  it('opens a fresh search each time', async () => {
    const user = userEvent.setup();
    render(<Project />);
    await user.click(screen.getByRole('button', { name: 'Jira project' }));
    await user.keyboard('web{Escape}');

    await user.click(screen.getByRole('button', { name: 'Jira project' }));

    expect(screen.getByRole('combobox', { name: 'Search Jira projects' })).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('a disabled field opens nothing', async () => {
    const user = userEvent.setup();
    render(<Project disabled />);

    await user.click(screen.getByRole('button', { name: 'Jira project' }));

    expect(screen.getByRole('button', { name: 'Jira project' })).toBeDisabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens from a trigger of the caller’s own, such as a toolbar Picker, which shows it is open (compact: its size is checked in the browser)', async () => {
    const user = userEvent.setup();
    let picked = '';
    render(
      <Combobox
        options={projects.slice(1)}
        value="WEB"
        onValueChange={(next) => {
          picked = next;
        }}
        searchLabel="Search projects"
        emptyText="No projects match"
        align="end"
        size="sm"
      >
        <Picker>Project: WEB</Picker>
      </Combobox>,
    );
    const trigger = screen.getByRole('button', { name: 'Project: WEB' });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('mob{Enter}');

    expect(picked).toBe('MOB');
  });
});
