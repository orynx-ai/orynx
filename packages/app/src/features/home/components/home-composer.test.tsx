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
    // Spec 026: with no ticket, an Ask until you pick Build.
    expect(posted).toEqual([{ message: 'Add a CSV export', repositoryId: web.id, context: [], mode: 'ask' }]);
    expect(useComposerStore.getState()).toMatchObject({ text: '', chips: [], lastUsed: web.id, mode: null });
  });

  it('spec 026: Ask or Build follows the chips until you pick, says what each does, and sends your pick', async () => {
    const posted = serve();
    const { user } = await renderApp();
    const mode = await screen.findByRole('group', { name: 'Session' });
    expect(within(mode).getByRole('button', { name: 'Ask' })).toHaveAttribute('aria-pressed', 'true');
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    await waitFor(() => {
      expect(within(mode).getByRole('button', { name: 'Build' })).toHaveAttribute('aria-pressed', 'true');
    });

    within(mode).getByRole('button', { name: 'Ask' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Claude reads the folder where it is and changes nothing',
    );
    await user.click(within(mode).getByRole('button', { name: 'Ask' }));
    await user.type(box(), 'What does it ask for?{Enter}');

    await waitFor(() => {
      expect(posted).toEqual([
        {
          message: 'What does it ask for?',
          repositoryId: web.id,
          context: [{ kind: 'jira', key: 'PROJ-1423' }],
          mode: 'ask',
        },
      ]);
    });
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
      expect(posted).toEqual([
        { message: '', repositoryId: web.id, context: [{ kind: 'jira', key: 'PROJ-1423' }], mode: 'build' },
      ]);
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
        { kind: 'file', path: '~/notes.md' },
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

describe('pasting and removing chips (spec 015)', () => {
  it('AC-14 (Q6): a pasted key or pull request link becomes its chip; a sentence stays text', async () => {
    serve();
    const { user } = await renderApp();
    await user.click(await screen.findByRole('textbox', { name: 'Describe a task for Claude' }));

    await user.paste('PROJ-1423');
    await user.paste('https://github.com/acme/web-app/pull/2836');
    expect(box()).toHaveValue('');
    const chips = within(screen.getByRole('list', { name: 'Context for Claude' })).getAllByRole('listitem');
    expect(chips.map((chip) => chip.textContent)).toEqual(['PROJ-1423', 'web-app #2836']);

    await user.paste('Fix PROJ-1377 too');
    expect(box()).toHaveValue('Fix PROJ-1377 too');
    expect(within(screen.getByRole('list', { name: 'Context for Claude' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('022 AC-3: an eleventh pasted pull request or ticket is said, not added', async () => {
    serve();
    const pulls = Array.from({ length: 100 }, (_, n) => ({
      kind: 'pull_request' as const,
      owner: 'acme',
      name: 'web-app',
      number: n + 1,
    }));
    useComposerStore.setState({ chips: pulls });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('textbox', { name: 'Describe a task for Claude' }));
    await user.paste('https://github.com/acme/web-app/pull/2836');
    expect(await screen.findByRole('alert')).toHaveTextContent('A session takes up to 100 pull requests.');
    expect(useComposerStore.getState().chips).toHaveLength(100);

    useComposerStore.setState({
      chips: Array.from({ length: 100 }, (_, n) => ({ kind: 'jira' as const, key: `OPS-${String(n + 1)}` })),
    });
    await user.paste('PROJ-1423');
    expect(await screen.findByRole('alert')).toHaveTextContent('A session takes up to 100 tickets.');
  });

  it('022 AC-2: pasting a key that’s there already adds nothing', async () => {
    serve();
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1423' }] });
    const { user } = await renderApp();
    await user.click(await screen.findByRole('textbox', { name: 'Describe a task for Claude' }));
    await user.paste('PROJ-1423');
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'jira', key: 'PROJ-1423' }]);
    expect(box()).toHaveValue('');
  });

  it('022 AC-7: removing the first ticket makes the next one lead the folder', async () => {
    const mobile = makeRepository({
      id: '00000000000000cc',
      name: 'mobile',
      displayPath: '~/code/mobile',
      jiraProject: 'MOB',
    });
    serve();
    server.use(http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [web, mobile] })));
    useComposerStore.setState({
      chips: [
        { kind: 'jira', key: 'PROJ-1423' },
        { kind: 'jira', key: 'MOB-7' },
      ],
    });
    const { user } = await renderApp();
    expect(await screen.findByRole('button', { name: 'Repository: web-app' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove PROJ-1423' }));

    expect(await screen.findByRole('button', { name: 'Repository: mobile' })).toBeVisible();
    expect(box()).toHaveAttribute('placeholder', 'What should Claude do with MOB-7?');
  });

  it('AC-15: a chip’s × by keyboard removes it, moves focus on and says so', async () => {
    serve();
    useComposerStore.setState({
      chips: [
        { kind: 'jira', key: 'PROJ-1423' },
        { kind: 'file', path: '~/notes.md' },
      ],
    });
    const { user } = await renderApp();
    const first = await screen.findByRole('button', { name: 'Remove PROJ-1423' });
    first.focus();

    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Remove notes.md' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('PROJ-1423 removed');
    await user.keyboard('{Enter}');
    expect(box()).toHaveFocus();
    expect(screen.queryByRole('list', { name: 'Context for Claude' })).toBeNull();
  });
});
