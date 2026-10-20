import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { apiUrl, server } from '../../test/msw.ts';
import { useUiStore } from '../../stores/ui-store.ts';
import { renderApp } from '../../test/render.tsx';

describe('SettingsScreen', () => {
  it('opens on Connections from /settings', async () => {
    const { history } = await renderApp({ route: '/settings' });

    expect(await screen.findByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-selected', 'true');
    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('AC-1: has the seven tabs, Skills after Coding agent (spec 023) and Notifications after Skills (spec 029, AC-32), each at its own address', async () => {
    const { user, history } = await renderApp({ route: '/settings/connections' });

    const tabs = within(await screen.findByRole('tablist', { name: 'Settings sections' })).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Connections',
      'Coding agent',
      'Skills',
      'Notifications',
      'Repositories',
      'Inbox rules',
    ]);

    for (const [name, path] of [
      ['Coding agent', '/settings/coding-agent'],
      ['Skills', '/settings/skills'],
      ['Notifications', '/settings/notifications'],
      ['Repositories', '/settings/repositories'],
      ['Inbox rules', '/settings/inbox-rules'],
    ] as const) {
      await user.click(screen.getByRole('tab', { name }));
      expect(history.location.pathname).toBe(path);
    }
  });

  it('AC-1: opens straight on a tab from its address', async () => {
    await renderApp({ route: '/settings/repositories' });

    expect(await screen.findByRole('tab', { name: 'Repositories' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-13 (spec 020): Hide this note closes the local-first note for good, with focus on the open tab', async () => {
    const { user } = await renderApp({ route: '/settings/connections' });
    await screen.findByText('Everything stays on this computer');

    await user.click(screen.getByRole('button', { name: 'Hide this note' }));

    expect(screen.queryByText('Everything stays on this computer')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Connections' })).toHaveFocus();
    expect(JSON.parse(localStorage.getItem('devhub.ui') ?? '{}')).toMatchObject({
      state: { localFirstNoteHidden: true },
    });
  });

  it('AC-13 (spec 020): a note hidden before stays hidden after a reload', async () => {
    localStorage.setItem('devhub.ui', JSON.stringify({ state: { localFirstNoteHidden: true }, version: 1 }));
    await useUiStore.persist.rehydrate();
    await renderApp({ route: '/settings' });

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.queryByText('Everything stays on this computer')).not.toBeInTheDocument();
  });

  it('says that everything stays on this computer on Connections alone, under a title for screen readers', async () => {
    const { user } = await renderApp({ route: '/settings/connections' });
    expect(await screen.findByText('Everything stays on this computer')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toHaveClass('sr-only');

    await user.click(screen.getByRole('tab', { name: 'Repositories' }));
    expect(screen.queryByText('Everything stays on this computer')).not.toBeInTheDocument();
  });

  it('switches tabs through the URL', async () => {
    const { user, history } = await renderApp({ route: '/settings/connections' });

    await user.click(await screen.findByRole('tab', { name: 'Inbox rules' }));

    expect(history.location.pathname).toBe('/settings/inbox-rules');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Inbox rules')).toBeVisible();
  });

  it('falls back to Connections for an unknown tab, such as Appearance, which moved to the profile menu', async () => {
    await renderApp({ route: '/settings/appearance' });
    expect(await screen.findByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-13: arrow keys reach Coding agent and its address, Tab reaches Check again, and Enter and Space press it', async () => {
    let checks = 0;
    server.use(
      http.post(apiUrl(apiRoutes.claudeLoginCheck), () => {
        checks += 1;
        return HttpResponse.json({ state: 'signed_out' });
      }),
    );
    const { user, history } = await renderApp({ route: '/settings/connections' });
    const connections = await screen.findByRole('tab', { name: 'Connections' });
    connections.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Coding agent' })).toHaveFocus();
    await waitFor(() => {
      expect(history.location.pathname).toBe('/settings/coding-agent');
    });
    const check = await screen.findByRole('button', { name: 'Check again' });

    await user.tab();
    expect(screen.getByRole('tabpanel', { name: 'Coding agent' })).toHaveFocus();
    await user.tab();
    expect(check).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(checks).toBe(1);
    });
    await waitFor(() => {
      expect(check).toHaveAccessibleName('Check again');
    });
    await user.keyboard(' ');
    await waitFor(() => {
      expect(checks).toBe(2);
    });
  });

  it('AC-18: arrow keys move between the tabs, and Tab leaves the list', async () => {
    const { user } = await renderApp({ route: '/settings/connections' });
    const connections = await screen.findByRole('tab', { name: 'Connections' });
    connections.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Coding agent' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Connections' })).toHaveFocus();

    await user.tab();
    expect(screen.getAllByRole('tab').some((tab) => tab === document.activeElement)).toBe(false);
  });
});
