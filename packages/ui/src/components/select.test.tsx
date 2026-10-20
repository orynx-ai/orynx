import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Field } from './field.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select.tsx';

function Sounds({
  label,
  ...props
}: Partial<Parameters<typeof Select>[0]> & { label?: string; ref?: React.Ref<HTMLButtonElement> }) {
  const { ref, ...root } = props;
  return (
    <Select defaultValue="knock" {...root}>
      <SelectTrigger ref={ref} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        <SelectItem value="knock">Knock</SelectItem>
        <SelectItem value="ping">Ping</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('inside a field, is named by its label, described by its help line, and shows the picked option', () => {
    render(
      <Field label="Sound" help="Plays when Claude is waiting.">
        <Sounds />
      </Field>,
    );

    const select = screen.getByRole('combobox', { name: 'Sound' });
    expect(select).toHaveAccessibleDescription('Plays when Claude is waiting.');
    expect(select).toHaveTextContent('Knock');
  });

  it('opens on a click, ticks the picked option, and picks another', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sounds label="Sound" onValueChange={onValueChange} />);
    const select = screen.getByRole('combobox', { name: 'Sound' });

    await user.click(select);
    expect(screen.getByRole('option', { name: 'Knock' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'Ping' }));

    expect(onValueChange).toHaveBeenCalledWith('ping');
    expect(select).toHaveTextContent('Ping');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(select).toHaveFocus();
  });

  it('works from the keyboard: Enter opens it, arrows move, Enter picks, Esc closes without picking', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Sounds label="Sound" onValueChange={onValueChange} />);
    const select = screen.getByRole('combobox', { name: 'Sound' });
    select.focus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('option', { name: 'Knock' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenLastCalledWith('ping');

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowUp}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(select).toHaveTextContent('Ping');
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('is marked invalid and described by the error when its field has one', () => {
    render(
      <Field label="to" error="Quiet hours need a different start and end.">
        <Sounds />
      </Field>,
    );

    const select = screen.getByRole('combobox', { name: 'to' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Quiet hours need a different start and end.');
  });

  it('can be turned off, and then does not open', async () => {
    const user = userEvent.setup();
    render(<Sounds label="Sound" disabled />);
    const select = screen.getByRole('combobox', { name: 'Sound' });

    expect(select).toBeDisabled();
    await user.click(select);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('hands its ref to the trigger, so a form library can focus it', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Sounds label="Sound" ref={ref} />);

    expect(ref.current).toBe(screen.getByRole('combobox', { name: 'Sound' }));
  });

  it('has no accessibility violations, closed with help, an error or turned off, and open', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <Field label="Sound" help="Plays when Claude is waiting.">
          <Sounds />
        </Field>
        <Field label="Second sound" error="Pick a sound.">
          <Sounds />
        </Field>
        <Field label="Third sound">
          <Sounds disabled />
        </Field>
      </>,
    );
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('combobox', { name: 'Sound' }));
    await expectNoAxeViolations(screen.getByRole('listbox'));
  });
});
