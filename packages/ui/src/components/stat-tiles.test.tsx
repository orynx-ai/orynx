import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { StatTiles } from './stat-tiles.tsx';

describe('StatTiles (spec 035)', () => {
  it('AC-9: holds each figure under its name, as a list of terms', async () => {
    const { container } = render(
      <StatTiles
        items={[
          { term: 'Last good sync', detail: '10:41' },
          { term: 'Success, last 2 h', detail: '58 of 60' },
        ]}
      />,
    );

    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Last good sync',
      'Success, last 2 h',
    ]);
    expect(screen.getAllByRole('definition').map((detail) => detail.textContent)).toEqual(['10:41', '58 of 60']);
    await expectNoAxeViolations(container);
  });
});
