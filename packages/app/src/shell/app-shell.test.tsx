import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

describe('AppShell', () => {
  it('AC-17: makes "Skip to content" the first stop, and Enter moves focus to the main region', async () => {
    const { user } = await renderApp();
    await screen.findByRole('heading', { name: 'What should we ship today?' });

    await user.tab();

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#main');

    await user.keyboard('{Enter}');

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('asks to reload when the server answers 401 after a restart', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json({ code: 'unauthorized', message: 'Reload the page.' }, { status: 401 }),
      ),
    );
    const { user, platform } = await renderApp();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Orynx restarted')).toBeVisible();

    await user.click(within(alert).getByRole('button', { name: 'Reload' }));

    expect(platform.reload).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations on Home', async () => {
    const { container } = await renderApp();
    await screen.findByRole('button', { name: 'Profile: You' });
    await expectNoAxeViolations(container);
  });
});
