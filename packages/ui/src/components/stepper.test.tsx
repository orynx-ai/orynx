import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Stepper } from './stepper.tsx';

const steps = ['Plan', 'Build', 'Test', 'Review', 'Pull request'];

describe('Stepper', () => {
  it('AC-3: is a named ordered list where done steps say so and the current step is marked', async () => {
    const { container } = render(<Stepper aria-label="Session progress" steps={steps} current={2} />);

    const list = screen.getByRole('list', { name: 'Session progress' });
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Plan, done',
      'Build, done',
      '3Test',
      '4Review',
      '5Pull request',
    ]);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items.filter((item) => item.hasAttribute('aria-current'))).toHaveLength(1);
    // The numbers and checks are drawn for the eye; a screen reader hears the words.
    for (const mark of container.querySelectorAll('[data-slot=stepper-mark]')) {
      expect(mark).toHaveAttribute('aria-hidden', 'true');
    }
    await expectNoAxeViolations(container);
  });

  it('marks every step done once the last one is finished', () => {
    render(<Stepper aria-label="Session progress" steps={steps} current={steps.length} />);

    const items = screen.getAllByRole('listitem');
    expect(items.every((item) => item.textContent.endsWith(', done'))).toBe(true);
    expect(items.some((item) => item.hasAttribute('aria-current'))).toBe(false);
  });

  it('shows nothing done at the first step', () => {
    render(<Stepper aria-label="Session progress" steps={steps} current={0} />);

    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText(', done')).not.toBeInTheDocument();
  });

  it('AC-11 (spec 031): a skipped step shows a dash, not a check, and says it was skipped', async () => {
    const { container } = render(<Stepper aria-label="Session progress" steps={steps} current={3} skipped={[1, 2]} />);

    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Plan, done',
      'Build, skipped',
      'Test, skipped',
      '4Review',
      '5Pull request',
    ]);
    expect(items[2]).toHaveAttribute('data-state', 'skipped');
    expect(items[3]).toHaveAttribute('aria-current', 'step');
    await expectNoAxeViolations(container);
  });

  it('a step ahead of the current one is never skipped', () => {
    render(<Stepper aria-label="Session progress" steps={steps} current={1} skipped={[2]} />);
    expect(screen.getAllByRole('listitem')[2]).toHaveAttribute('data-state', 'todo');
  });
});
