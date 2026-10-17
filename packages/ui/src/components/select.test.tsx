import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Field } from './field.tsx';
import { Select } from './select.tsx';

function Projects(props: Partial<Parameters<typeof Select>[0]>) {
  return (
    <Select defaultValue="" {...props}>
      <option value="">No Jira project</option>
      <option value="MOB">MOB · Mobile</option>
      <option value="PROJ">PROJ · Intranet</option>
    </Select>
  );
}

describe('Select', () => {
  it('AC-5: inside a field, is named by its label and described by its help line', () => {
    render(
      <Field label="Jira project" help="Tickets from this project open in this folder.">
        <Projects />
      </Field>,
    );

    const select = screen.getByRole('combobox', { name: 'Jira project' });
    expect(select).toHaveAccessibleDescription('Tickets from this project open in this folder.');
    expect(select).toHaveValue('');
  });

  // The arrow keys and type-ahead are the browser's own; the e2e run covers them.
  it('AC-5: picks an option', async () => {
    const onChange = vi.fn();
    render(
      <Field label="Jira project">
        <Projects onChange={onChange} />
      </Field>,
    );
    const select = screen.getByRole('combobox', { name: 'Jira project' });

    await userEvent.selectOptions(select, 'PROJ');
    expect(select).toHaveValue('PROJ');

    await userEvent.selectOptions(select, 'No Jira project');
    expect(select).toHaveValue('');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('is marked invalid and described by the error when its field has one', () => {
    render(
      <Field label="Jira project" error="Pick a Jira project.">
        <Projects />
      </Field>,
    );

    const select = screen.getByRole('combobox', { name: 'Jira project' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Pick a Jira project.');
  });

  it('AC-8: can be turned off', () => {
    render(
      <Field label="Jira project" help="Connect Jira in Connections to pick a project.">
        <Projects disabled />
      </Field>,
    );

    expect(screen.getByRole('combobox', { name: 'Jira project' })).toBeDisabled();
  });

  it('hands its ref to the select, so a form library can focus it', () => {
    const ref = createRef<HTMLSelectElement>();
    render(<Projects ref={ref} aria-label="Jira project" />);

    expect(ref.current).toBe(screen.getByRole('combobox', { name: 'Jira project' }));
  });

  it('has no accessibility violations, with help, an error or turned off', async () => {
    const { container } = render(
      <>
        <Field label="Jira project" help="Tickets from this project open in this folder.">
          <Projects />
        </Field>
        <Field label="Second project" error="Pick a Jira project.">
          <Projects />
        </Field>
        <Field label="Third project">
          <Projects disabled />
        </Field>
      </>,
    );

    await expectNoAxeViolations(container);
  });
});
