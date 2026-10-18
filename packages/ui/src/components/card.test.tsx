import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Card } from './card.tsx';
import { Pill } from './pill.tsx';

describe('Card', () => {
  it('AC-2: is named by its heading, with what it says beside the title and its lines below', async () => {
    const { container } = render(
      <Card title="Claude" look="selected" aside={<Pill tone="success">Active</Pill>}>
        <p>Uses your company Claude login through the Claude Agent SDK. No separate API key.</p>
      </Card>,
    );

    const card = screen.getByRole('group', { name: 'Claude' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Claude' })).toBeVisible();
    expect(within(card).getByText('Active')).toBeVisible();
    expect(within(card).getByText(/No separate API key/)).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('AC-15: a placeholder card needs nothing beside its title', async () => {
    const { container } = render(
      <Card title="More agents" look="placeholder">
        <p>Coming later. Each agent plugs in through one small adapter.</p>
      </Card>,
    );

    expect(screen.getByRole('group', { name: 'More agents' })).toHaveTextContent(
      'More agentsComing later. Each agent plugs in through one small adapter.',
    );
    await expectNoAxeViolations(container);
  });

  it('takes the heading level the page needs', () => {
    render(<Card title="Claude" headingLevel={3} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Claude' })).toBeVisible();
  });

  it('AC-14: lets the page add layout, such as its width in a row', () => {
    render(<Card title="Claude" className="min-w-0" />);

    expect(screen.getByRole('group', { name: 'Claude' })).toHaveClass('min-w-0');
  });
});
