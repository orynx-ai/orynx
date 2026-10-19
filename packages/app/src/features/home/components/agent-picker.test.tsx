import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

describe('the composer’s agent picker (spec 015, Q10)', () => {
  it('AC-19: Claude signed out says so, in words as well as its dot, and leads to Settings › Coding agent', async () => {
    const { user, history } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Agent: Claude, signed out' }));
    const menu = await screen.findByRole('menu', { name: 'Agent' });
    const claude = within(menu).getByRole('menuitemradio', { name: /Claude/ });
    expect(claude).toHaveAttribute('aria-checked', 'true');
    expect(claude).toHaveTextContent('Signed out');

    await user.click(within(menu).getByRole('menuitem', { name: 'Open Settings › Coding agent' }));
    expect(history.location.pathname).toBe('/settings/coding-agent');
  });

  it('AC-19: Claude connected runs locally, with nothing to fix', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(makeStatus({ agent: { id: 'claude', connected: true } })),
      ),
    );
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Agent: Claude, connected' }));
    const menu = await screen.findByRole('menu', { name: 'Agent' });
    expect(within(menu).getByRole('menuitemradio', { name: /Claude/ })).toHaveTextContent('Connected · runs locally');
    expect(within(menu).queryByRole('menuitem')).toBeNull();
  });
});
