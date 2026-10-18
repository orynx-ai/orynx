import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type StartSessionAnswer } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { useComposerStore } from '../store.ts';

const web = makeRepository({ id: '00000000000000aa', name: 'web-app', displayPath: '~/code/web-app' });

/** One folder, and Send answering `answer`; returns every body Send posted. */
function serve(
  answer: StartSessionAnswer | 'network_error' | 'slow' = { result: 'started', sessionId: '0123456789abcdef' },
) {
  const posted: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [web] })),
    http.post(apiUrl(apiRoutes.sessions), async ({ request }) => {
      posted.push(await request.json());
      if (answer === 'network_error') return HttpResponse.error();
      if (answer === 'slow') await delay('infinite');
      return HttpResponse.json(answer);
    }),
  );
  return posted;
}

const box = () => screen.getByRole('textbox', { name: 'Describe a task for Claude' });
const send = () => screen.getByRole('button', { name: /^Send(ing)? to Claude$/ });

describe('Home’s composer (spec 015)', () => {
  it('AC-3: empty and with no ticket, Send is off and the box asks for a task', async () => {
    serve();
    await renderApp();
    expect(await screen.findByRole('textbox', { name: 'Describe a task for Claude' })).toHaveAttribute(
      'placeholder',
      'Describe a task, or paste a Jira key like PROJ-1423',
    );
    expect(send()).toHaveAttribute('aria-disabled', 'true');
  });

  it('AC-4: Enter sends your message with the folder, opens the session and empties the draft', async () => {
    const posted = serve();
    const { user, history } = await renderApp();
    await user.type(await screen.findByRole('textbox', { name: 'Describe a task for Claude' }), 'Add a CSV export');
    await waitFor(() => {
      expect(send()).not.toHaveAttribute('aria-disabled');
    });

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(history.location.pathname).toBe('/sessions/0123456789abcdef');
    });
    expect(posted).toEqual([{ message: 'Add a CSV export', repositoryId: web.id, context: [] }]);
    expect(useComposerStore.getState()).toMatchObject({ text: '', chips: [], lastUsed: web.id });
  });

  it('AC-5: Shift+Enter starts a new line and sends nothing', async () => {
    const posted = serve();
    const { user } = await renderApp();
    await user.type(
      await screen.findByRole('textbox', { name: 'Describe a task for Claude' }),
      'One{Shift>}{Enter}{/Shift}two',
    );
    expect(box()).toHaveValue('One\ntwo');
    expect(posted).toEqual([]);
  });

  it('AC-8: a ticket chip is the brief, so the box asks what to do with it and Send works empty', async () => {
    const posted = serve();
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    const { user } = await renderApp();

    const chips = await screen.findByRole('list', { name: 'Context for Claude' });
    expect(within(chips).getByText('PROJ-1423')).toBeVisible();
    expect(box()).toHaveAttribute('placeholder', 'What should Claude do with PROJ-1423?');
    await user.click(send());

    await waitFor(() => {
      expect(posted).toEqual([{ message: '', repositoryId: web.id, context: [{ kind: 'jira', key: 'PROJ-1423' }] }]);
    });
  });

  it('AC-4: while it sends, Send is busy and the box can’t change', async () => {
    serve('slow');
    const { user } = await renderApp();
    await user.type(await screen.findByRole('textbox', { name: 'Describe a task for Claude' }), 'Fix the header');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(send()).toHaveAttribute('aria-busy', 'true');
    });
    expect(send()).toHaveAccessibleName('Sending to Claude');
    expect(box()).toHaveAttribute('readonly');
  });

  it('AC-21: a chip Jira can’t give is named, and the draft, chips and folder stay', async () => {
    serve({ result: 'context_failed', chip: 1, problem: 'not_found' });
    useComposerStore.setState({
      text: 'Use the notes',
      chips: [
        { kind: 'file', name: 'notes.md', text: 'x' },
        { kind: 'jira', key: 'PROJ-9999' },
      ],
    });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Send to Claude' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Jira can't find PROJ-9999, or you can't see it.");
    expect(box()).toHaveValue('Use the notes');
    expect(within(screen.getByRole('list', { name: 'Context for Claude' })).getAllByRole('listitem')).toHaveLength(2);
    expect(send()).not.toHaveAttribute('aria-disabled');
  });

  it('AC-22: Claude Code signed out says so, with the way to Settings', async () => {
    serve({ result: 'cannot_start', reason: 'signed_out' });
    useComposerStore.setState({ text: 'Fix the header' });
    const { user, history } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Send to Claude' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Claude Code isn't signed in.");
    await user.click(within(alert).getByRole('link', { name: 'Open Settings › Coding agent' }));
    expect(history.location.pathname).toBe('/settings/coding-agent');
  });

  it('AC-23: a ticket with a live session says so, with Open session, and keeps the draft', async () => {
    serve({ result: 'existing', sessionId: '00000000000000ee' });
    useComposerStore.setState({ text: 'Only the tests', chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Send to Claude' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('PROJ-1423 already has a session.');
    expect(within(alert).getByRole('link', { name: 'Open session' })).toHaveAttribute(
      'href',
      '/sessions/00000000000000ee',
    );
    expect(box()).toHaveValue('Only the tests');
  });

  it('AC-21: a send that never reached the server says to try again', async () => {
    serve('network_error');
    useComposerStore.setState({ text: 'Fix the header' });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Send to Claude' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start Claude. Try again.");
  });

  it('refuses a message over 10,000 characters before it goes', async () => {
    const posted = serve();
    useComposerStore.setState({ text: 'x'.repeat(10_001) });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Send to Claude' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Keep it under 10,000 characters.');
    expect(posted).toEqual([]);
  });
});
