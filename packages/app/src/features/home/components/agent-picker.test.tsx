import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type AgentModel, type AgentModels } from '@devhub/contracts';
import { makeRepository, makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { useComposerStore } from '../store.ts';

const models: AgentModel[] = [
  { value: 'default', displayName: 'Default', description: 'Opus for complex work', efforts: ['low', 'high'] },
  { value: 'sonnet', displayName: 'Sonnet', description: 'Everyday tasks', efforts: ['low', 'high', 'xhigh', 'max'] },
  { value: 'haiku', displayName: 'Haiku', description: 'Fastest', efforts: [] },
];
const listed: AgentModels = { state: 'ready', models };

/** Claude connected, offering `models`, with one folder; returns every body Send posted. */
function connected(answer: AgentModels = listed) {
  const posted: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.status), () =>
      HttpResponse.json(makeStatus({ agent: { id: 'claude', connected: true } })),
    ),
    http.get(apiUrl(apiRoutes.agentModels), () => HttpResponse.json(answer)),
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [makeRepository()] })),
    http.post(apiUrl(apiRoutes.sessions), async ({ request }) => {
      posted.push(await request.json());
      return HttpResponse.json({ result: 'started', sessionId: '0123456789abcdef' });
    }),
  );
  return posted;
}

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

  it('lists the models Claude offers now, then the effort levels the picked one takes', async () => {
    connected();
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Agent: Claude, Default, connected' }));
    let menu = await screen.findByRole('menu', { name: 'Agent' });
    expect(within(menu).getByRole('menuitemradio', { name: /Opus for complex work/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByText('Effort')).toBeVisible();
    await user.click(within(menu).getByRole('menuitemradio', { name: /^Sonnet/ }));

    await user.click(screen.getByRole('button', { name: 'Agent: Claude, Sonnet, connected' }));
    menu = await screen.findByRole('menu', { name: 'Agent' });
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual([
      'DefaultOpus for complex work',
      'SonnetEveryday tasks',
      'HaikuFastest',
      'Default',
      'Low',
      'High',
      'Extra high',
      'Max',
    ]);
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Max' }));

    expect(screen.getByRole('button', { name: 'Agent: Claude, Sonnet · Max, connected' })).toHaveTextContent(
      'Sonnet · Max',
    );
    expect(useComposerStore.getState()).toMatchObject({ model: 'sonnet', effort: 'max' });
  });

  it('a model that takes no effort level drops the one picked, and shows no levels', async () => {
    connected();
    useComposerStore.setState({ model: 'sonnet', effort: 'max' });
    const { user } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Agent: Claude, Sonnet · Max, connected' }));
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitemradio', { name: /^Haiku/ }));
    await user.click(screen.getByRole('button', { name: 'Agent: Claude, Haiku, connected' }));

    expect(within(await screen.findByRole('menu')).queryByText('Effort')).toBeNull();
    expect(useComposerStore.getState()).toMatchObject({ model: 'haiku', effort: null });
  });

  it('Send starts Claude with the model and effort picked, and leaves out a model Claude no longer offers', async () => {
    const posted = connected();
    useComposerStore.setState({ model: 'sonnet', effort: 'high' });
    const { user, history } = await renderApp();
    await screen.findByRole('button', { name: 'Agent: Claude, Sonnet · High, connected' });

    await user.type(screen.getByRole('textbox', { name: 'Describe a task for Claude' }), 'Add a CSV export{Enter}');
    await waitFor(() => {
      expect(history.location.pathname).toBe('/sessions/0123456789abcdef');
    });
    expect(posted).toEqual([expect.objectContaining({ model: 'sonnet', effort: 'high' })]);
    // Picked for the next task too.
    expect(useComposerStore.getState()).toMatchObject({ model: 'sonnet', effort: 'high' });
  });

  it('a model picked earlier that Claude no longer lists is left to Claude Code, and the menu checks none', async () => {
    const posted = connected({ state: 'ready', models: models.slice(1) });
    useComposerStore.setState({ model: 'opus-old', effort: 'high' });
    const { user, history } = await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Agent: Claude, connected' }));
    const menu = await screen.findByRole('menu', { name: 'Agent' });
    for (const item of within(menu).getAllByRole('menuitemradio'))
      expect(item).toHaveAttribute('aria-checked', 'false');
    await user.keyboard('{Escape}');

    await user.type(screen.getByRole('textbox', { name: 'Describe a task for Claude' }), 'Add a CSV export{Enter}');
    await waitFor(() => {
      expect(history.location.pathname).toBe('/sessions/0123456789abcdef');
    });
    expect(posted[0]).not.toHaveProperty('model');
    expect(posted[0]).not.toHaveProperty('effort');
  });
});
