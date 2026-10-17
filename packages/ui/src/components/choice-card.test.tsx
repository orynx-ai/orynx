import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ChoiceCard } from './choice-card.tsx';

describe('ChoiceCard', () => {
  it('AC-2: is a radio named by its title and described by its detail line', () => {
    render(
      <ChoiceCard name="method" value="gh" title="Use my gh login" detail="gh isn't installed on this computer." />,
    );

    const radio = screen.getByRole('radio', { name: 'Use my gh login' });
    expect(radio).toHaveAttribute('value', 'gh');
    expect(radio).toHaveAccessibleDescription("gh isn't installed on this computer.");
  });

  it('picks its radio when the card is clicked anywhere, the detail line included', async () => {
    const onChange = vi.fn();
    render(
      <ChoiceCard name="theme" value="dark" title="Dark" detail="Easier on the eyes at night." onChange={onChange} />,
    );

    await userEvent.click(screen.getByText('Easier on the eyes at night.'));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('works without a detail line', () => {
    render(<ChoiceCard name="theme" value="light" title="Light" defaultChecked />);

    const radio = screen.getByRole('radio', { name: 'Light' });
    expect(radio).toBeChecked();
    expect(radio).not.toHaveAttribute('aria-describedby');
  });

  it('hands its ref to the radio, so a form library can focus it', () => {
    const ref = createRef<HTMLInputElement>();
    render(<ChoiceCard ref={ref} name="method" value="token" title="Use a personal access token" />);

    expect(ref.current).toBe(screen.getByRole('radio', { name: 'Use a personal access token' }));
  });

  it('has no accessibility violations, checked or not', async () => {
    const { container } = render(
      <fieldset>
        <legend>Theme</legend>
        <ChoiceCard name="theme" value="light" title="Light" defaultChecked />
        <ChoiceCard name="theme" value="dark" title="Dark" detail="Easier on the eyes at night." />
      </fieldset>,
    );
    await expectNoAxeViolations(container);
  });
});
