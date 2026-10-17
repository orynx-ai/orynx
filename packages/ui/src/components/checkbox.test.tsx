import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Checkbox } from './checkbox.tsx';

describe('Checkbox', () => {
  it('AC-12: is a checkbox named by its label', () => {
    render(<Checkbox label="Pull requests waiting for my review" defaultChecked />);

    expect(screen.getByRole('checkbox', { name: 'Pull requests waiting for my review' })).toBeChecked();
  });

  it('AC-13: toggles when the row is clicked anywhere, the label included', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="My pull requests with failing checks" defaultChecked onChange={onChange} />);

    await userEvent.click(screen.getByText('My pull requests with failing checks'));

    expect(screen.getByRole('checkbox', { name: 'My pull requests with failing checks' })).not.toBeChecked();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('AC-19: toggles with Space from the keyboard', async () => {
    render(<Checkbox label="Claude sessions waiting for my approval" />);

    await userEvent.tab();
    await userEvent.keyboard(' ');

    expect(screen.getByRole('checkbox', { name: 'Claude sessions waiting for my approval' })).toBeChecked();
  });

  it('does nothing while disabled', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Jira tickets assigned to me that aren't done" disabled onChange={onChange} />);

    await userEvent.click(screen.getByText("Jira tickets assigned to me that aren't done"));

    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hands its ref to the checkbox, so a form library can focus it', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox ref={ref} label="My pull requests with unresolved review comments" />);

    expect(ref.current).toBe(screen.getByRole('checkbox'));
  });

  it('has no accessibility violations, checked, unchecked or disabled', async () => {
    const { container } = render(
      <>
        <Checkbox label="Pull requests waiting for my review" defaultChecked />
        <Checkbox label="My pull requests with failing checks" />
        <Checkbox label="Claude sessions waiting for my approval" disabled />
      </>,
    );

    await expectNoAxeViolations(container);
  });
});
