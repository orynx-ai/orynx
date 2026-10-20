import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes, type SendMessageAnswer, type Session } from '@devhub/contracts';
import { makeSession, makeSessionList, makeSessionSummary } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler, sessionsHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { initialDrafts, useSessionDrafts } from '../store.ts';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const done = makeSession({ id, state: 'done', step: 'review' });

beforeEach(() => {
  useSessionDrafts.setState(initialDrafts);
});

/** The session, and every follow-up the page sends, answered with `answer`. */
function serve(session: Session, answer: SendMessageAnswer | 'fails' | 'slow' = { result: 'sent' }) {
  const sent: unknown[] = [];
  server.use(
    sessionHandler(session),
    http.post(apiUrl(apiRoutes.sessionMessages), async ({ request }) => {
      sent.push(await request.json());
      if (answer === 'fails') return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      if (answer === 'slow') await delay('infinite');
      return HttpResponse.json(answer);
    }),
  );
  return sent;
}

const box = () => screen.getByRole('textbox', { name: 'Message Claude' });

describe('FollowUpBox', () => {
  it('AC-11, AC-21: Enter sends exactly what you typed, then the box clears and keeps focus', async () => {
    const sent = serve(done);
    const { user } = await renderApp({ route });

    await user.type(await screen.findByRole('textbox', { name: 'Message Claude' }), 'Use the existing hook{Enter}');

    await waitFor(() => {
      expect(sent).toEqual([{ text: 'Use the existing hook', context: [] }]);
    });
    await waitFor(() => {
      expect(box()).toHaveValue('');
    });
    expect(box()).toHaveFocus();
    expect(screen.getByPlaceholderText('Ask Claude to change something')).toBe(box());
  });

  it('AC-21: Shift+Enter adds a line, Enter while an input method composes sends nothing, and an empty box sends nothing', async () => {
    const sent = serve(done);
    const { user } = await renderApp({ route });

    await user.click(await screen.findByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveAttribute('aria-disabled', 'true');
    await user.type(box(), 'First line{Shift>}{Enter}{/Shift}second line');
    expect(box()).toHaveValue('First line\nsecond line');
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(sent).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => {
      expect(sent).toEqual([{ text: 'First line\nsecond line', context: [] }]);
    });
  });

  it('AC-15: says why a message didn’t go, and keeps your text', async () => {
    serve(done, { result: 'cannot_send', reason: 'too_many' });
    const { user } = await renderApp({ route });
    await user.type(await screen.findByRole('textbox', { name: 'Message Claude' }), 'More{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Three sessions are already working. Stop one, then send.',
    );
    expect(box()).toHaveValue('More');
  });

  it('AC-15: says when the message couldn’t reach Orynx, and Send is ready again', async () => {
    serve(done, 'fails');
    const { user } = await renderApp({ route });
    await user.type(await screen.findByRole('textbox', { name: 'Message Claude' }), 'More{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send your message. Try again.");
    expect(box()).toHaveValue('More');
    expect(screen.getByRole('button', { name: 'Send message' })).not.toHaveAttribute('aria-busy');
  });

  it('AC-15: refuses a message longer than 10,000 characters before sending it', async () => {
    const sent = serve(done);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('textbox', { name: 'Message Claude' }));
    await user.paste('x'.repeat(10_001));
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Keep it under 10,000 characters.')).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('AC-11: shows Send busy while the message is on its way', async () => {
    serve(done, 'slow');
    const { user } = await renderApp({ route });
    await user.type(await screen.findByRole('textbox', { name: 'Message Claude' }), 'More{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send message' })).toHaveAttribute('aria-busy', 'true');
    });
  });

  it('AC-14: says why there’s nothing to carry on in place of the box, and links to a newer session', async () => {
    serve(makeSession({ id, state: 'stopped', followUp: { kind: 'newer_session', sessionId: 'fedcba9876543210' } }));
    server.use(
      sessionsHandler(
        makeSessionList([makeSessionSummary({ id: 'fedcba9876543210', title: 'Add bulk archive again' })]),
      ),
    );
    const { user, history } = await renderApp({ route });

    expect(await screen.findByText('PROJ-1423 has a newer session.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message Claude' })).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Open it' }));
    expect(history.location.pathname).toBe('/sessions/fedcba9876543210');
  });

  it.each([
    [{ kind: 'discarded' } as const, "The changes were discarded, so Claude can't carry on."],
    [
      { kind: 'never_started' } as const,
      "Claude never started, so there's nothing to carry on. Start again from the ticket.",
    ],
  ])('AC-14: says %j has nothing to carry on', async (followUp, line) => {
    serve(makeSession({ id, state: 'stopped', followUp }));
    await renderApp({ route });
    expect(await screen.findByText(line)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Message Claude' })).toBeNull();
  });

  it('spec 025: a pasted key is a chip, sent with the message, and the chips go once it’s sent', async () => {
    const sent = serve(done);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('textbox', { name: 'Message Claude' }));
    await user.paste('PROJ-1500');
    const strip = screen.getByRole('list', { name: 'Context for Claude' });
    expect(within(strip).getByRole('button', { name: 'PROJ-1500' })).toBeVisible();

    await user.type(box(), 'Do this one too{Enter}');

    await waitFor(() => {
      expect(sent).toEqual([{ text: 'Do this one too', context: [{ kind: 'jira', key: 'PROJ-1500' }] }]);
    });
    await waitFor(() => {
      expect(screen.queryByRole('list', { name: 'Context for Claude' })).toBeNull();
    });
  });

  it('spec 025: + offers tickets, pull requests and files, not a folder: the session has its own', async () => {
    serve(done);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Add context' }));
    const menu = await screen.findByRole('menu', { name: 'Add context' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(
      ['TicketSearch by key or title', 'Pull requestSearch by repo, number or title', 'File from this computer'].map(
        (start) => expect.stringContaining(start) as unknown as string,
      ),
    );
  });

  it('spec 025: says which chip Jira couldn’t give, and keeps the message and the chip', async () => {
    serve(done, { result: 'context_failed', chip: 0, problem: 'not_found' });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('textbox', { name: 'Message Claude' }));
    await user.paste('PROJ-9999');
    await user.type(box(), 'And this{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Jira can't find PROJ-9999, or you can't see it.");
    expect(box()).toHaveValue('And this');
    expect(screen.getByRole('list', { name: 'Context for Claude' })).toBeVisible();
  });

  it('AC-19: keeps a message you haven’t sent while you look at another page', async () => {
    serve(done);
    server.use(sessionsHandler(makeSessionList([makeSessionSummary({ id, title: 'Add bulk archive' })])));
    const { user } = await renderApp({ route });
    await user.type(await screen.findByRole('textbox', { name: 'Message Claude' }), 'Half a thought');

    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    await user.click(within(sidebar).getByRole('link', { name: /^Tickets/ }));
    await screen.findByRole('heading', { level: 1 });
    await user.click(within(sidebar).getByRole('link', { name: /Add bulk archive/ }));

    expect(await screen.findByRole('textbox', { name: 'Message Claude' })).toHaveValue('Half a thought');
  });
});
