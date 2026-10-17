import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { StatusIcon, type StatusIconStatus } from './status-icon.tsx';

const statuses: StatusIconStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

describe('StatusIcon', () => {
  it('AC-25: draws to do, in progress, in review and done as four different shapes', () => {
    const { container } = render(
      <>
        {statuses.map((status) => (
          <StatusIcon key={status} status={status} />
        ))}
      </>,
    );

    const shapes = [...container.querySelectorAll('svg')].map((svg) => svg.innerHTML);
    expect(shapes).toHaveLength(4);
    expect(new Set(shapes).size).toBe(4);
  });

  it('AC-25: is hidden from screen readers next to a column name, and named when it stands alone', async () => {
    const { container } = render(
      <>
        <h2>
          <StatusIcon status="in_review" />
          In review
        </h2>
        <StatusIcon status="done" label="Done" />
      </>,
    );

    expect(screen.getByRole('heading', { name: 'In review' })).toBeVisible();
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Done' })).toBeVisible();
    await expectNoAxeViolations(container);
  });
});
