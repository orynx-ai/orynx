import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ChoiceCard } from './choice-card.tsx';
import { ChoiceGroup } from './choice-group.tsx';

function Ways({ help, error }: { help?: string; error?: string | null }) {
  return (
    <ChoiceGroup legend="Connect with" help={help} error={error}>
      <ChoiceCard name="method" value="gh" title="Use my gh login" detail="DevHub asks gh for your token each time." />
      <ChoiceCard name="method" value="token" title="Use a personal access token" detail="Kept in your keychain." />
    </ChoiceGroup>
  );
}

describe('ChoiceGroup', () => {
  it('AC-18: is a radio group named by its visible legend', () => {
    render(<Ways />);

    const group = screen.getByRole('radiogroup', { name: 'Connect with' });
    expect(group.tagName).toBe('FIELDSET');
    expect(screen.getByText('Connect with').tagName).toBe('LEGEND');
    expect(group).not.toHaveAttribute('aria-invalid');
  });

  it('AC-18: arrow keys move between the choices and pick the one they land on', async () => {
    const user = userEvent.setup();
    render(<Ways />);

    await user.click(screen.getByRole('radio', { name: 'Use my gh login' }));
    await user.keyboard('{ArrowDown}');

    const token = screen.getByRole('radio', { name: 'Use a personal access token' });
    expect(token).toBeChecked();
    expect(token).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Use my gh login' })).not.toBeChecked();
  });

  it('describes the group with its help line', () => {
    render(<Ways help="Pick one way." />);

    expect(screen.getByRole('radiogroup', { name: 'Connect with' })).toHaveAccessibleDescription('Pick one way.');
  });

  it('AC-4: puts the error in place of the help line and marks the group invalid', () => {
    render(<Ways help="Pick one way." error="gh isn't signed in to github.com." />);

    const group = screen.getByRole('radiogroup', { name: 'Connect with' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription("gh isn't signed in to github.com.");
    expect(screen.queryByText('Pick one way.')).not.toBeInTheDocument();
  });

  it.each([null, ''])('treats an error of %j as no error', (error) => {
    render(<Ways help="Pick one way." error={error} />);

    const group = screen.getByRole('radiogroup', { name: 'Connect with' });
    expect(group).not.toHaveAttribute('aria-invalid');
    expect(group).toHaveAccessibleDescription('Pick one way.');
  });

  it('has no accessibility violations with help, with an error, and with neither', async () => {
    const { container } = render(
      <>
        <Ways help="Pick one way." />
        <Ways error="gh isn't signed in to github.com." />
        <Ways />
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
