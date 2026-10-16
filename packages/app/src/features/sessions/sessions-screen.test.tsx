import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render.tsx';

describe('SessionsScreen', () => {
  it('shows that there are no sessions and how to start one', async () => {
    await renderApp({ route: '/sessions' });

    expect(await screen.findByText('No sessions yet', { selector: 'span' })).toBeVisible();
    expect(screen.getByText('Start one from Home or from a ticket.')).toBeVisible();
  });
});
