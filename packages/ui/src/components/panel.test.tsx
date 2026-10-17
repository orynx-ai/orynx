import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Panel } from './panel.tsx';

describe('Panel', () => {
  it('AC-25: is a region named by its heading, with its meta line and its list', async () => {
    const { container } = render(
      <Panel title="Needs your attention" meta="Sorted by how long it has waited">
        <ul>
          <li>Lazy-load the people directory</li>
        </ul>
      </Panel>,
    );

    const region = screen.getByRole('region', { name: 'Needs your attention' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Needs your attention' })).toBeVisible();
    expect(within(region).getByText('Sorted by how long it has waited')).toBeVisible();
    expect(within(region).getByRole('listitem')).toHaveTextContent('Lazy-load the people directory');
    await expectNoAxeViolations(container);
  });

  it('takes the heading level the page needs', () => {
    render(<Panel title="Changed files" headingLevel={3} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Changed files' })).toBeVisible();
  });

  it('is a plain surface when it has no title', () => {
    render(
      <Panel>
        <p>Tickets in Sprint 42</p>
      </Panel>,
    );

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByText('Tickets in Sprint 42')).toBeVisible();
  });
});
