import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { DetailList } from './detail-list.tsx';

describe('DetailList', () => {
  it('AC-7: pairs each term with its detail, in order, as a description list', async () => {
    const { container } = render(
      <DetailList
        aria-label="Jira details"
        items={[
          { term: 'Site', detail: 'your-team.atlassian.net' },
          { term: 'Account', detail: 'dev@example.com' },
        ]}
      />,
    );

    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Site', 'Account']);
    expect(screen.getAllByRole('definition').map((detail) => detail.textContent)).toEqual([
      'your-team.atlassian.net',
      'dev@example.com',
    ]);
    await expectNoAxeViolations(container);
  });
});
