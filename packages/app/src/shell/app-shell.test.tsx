import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

describe('AppShell', () => {
  it('makes "Skip to content" the first stop and points it at the main region', async () => {
    const { user } = await renderApp();
    await screen.findByRole('heading', { name: 'What should we build today?' });

    await user.tab();

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('asks to reload when the server answers 401 after a restart', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json({ code: 'unauthorized', message: 'Reload the page.' }, { status: 401 }),
      ),
    );
    const { user, platform } = await renderApp();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('DevHub restarted')).toBeVisible();

    await user.click(within(alert).getByRole('button', { name: 'Reload' }));

    expect(platform.reload).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations on Home', async () => {
    const { container } = await renderApp();
    await screen.findByText('Claude not connected · runs locally');
    await expectNoAxeViolations(container);
  });
});
