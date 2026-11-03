import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '00000000000000ab';
const pullUrl = 'https://github.com/acme/web-app/pull/2841';
const posted = 'https://acme.slack.com/archives/C024BE91L/p1793620000000100?thread_ts=1793613600.000100&cid=C024BE91L';
const withThread = makeSession({
  id,
  state: 'pr_open',
  pullRequest: {
    number: 2841,
    url: pullUrl,
    repository: 'acme/web-app',
    openedAt: '2026-11-02T10:00:00.000Z',
    title: 'Fix the archive API',
  },
  context: [
    {
      kind: 'slack_thread',
      channel: 'C024BE91L',
      ts: '1793613600.000100',
      label: { from: 'Neha K.', channel: 'web-platform', server: null },
    },
  ],
});

/** The session as the server has it, which Post reply and Not now change. */
function serve(start: Session = withThread, answer: object = { result: 'posted', url: posted }) {
  let session = start;
  const sent: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.session), () => HttpResponse.json(session)),
    http.post(apiUrl(apiRoutes.sessionThreadReply), async ({ request }) => {
      sent.push(await request.json());
      if ('url' in answer)
        session = { ...session, threadReply: { state: 'posted', url: posted, channel: 'web-platform' } };
      return HttpResponse.json(answer);
    }),
    http.post(apiUrl(apiRoutes.sessionThreadReplyDismiss), () => {
      session = { ...session, threadReply: { state: 'dismissed' } };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { sent };
}

async function openSession() {
  const rendered = await renderApp({ route: `/sessions/${id}` });
  return { ...rendered, callout: await screen.findByRole('form', { name: 'Tell the thread' }) };
}

describe('Tell the thread (spec 016, E)', () => {
  it('AC-40: offers the reply with the pull request’s title and link, to edit, with nothing posted', async () => {
    const { sent } = serve();
    const { callout } = await openSession();

    expect(within(callout).getByRole('textbox', { name: 'Reply in #web-platform' })).toHaveValue(
      `A fix is up for review: Fix the archive API ${pullUrl}`,
    );
    expect(within(callout).getByRole('button', { name: 'Post reply' })).toBeVisible();
    expect(within(callout).getByRole('button', { name: 'Not now' })).toBeVisible();
    expect(sent).toEqual([]);
    await expectNoAxeViolations(callout);
  });

  it('AC-41: Post reply sends the reply as edited, then says where it went, with Open thread', async () => {
    const { sent } = serve();
    const { user, callout } = await openSession();

    const box = within(callout).getByRole('textbox', { name: 'Reply in #web-platform' });
    await user.clear(box);
    await user.type(box, 'Fixed in web-app #2841');
    await user.click(within(callout).getByRole('button', { name: 'Post reply' }));

    expect(await screen.findByText('Replied in #web-platform.')).toBeVisible();
    expect(screen.getByRole('link', { name: /Open thread/ })).toHaveAttribute('href', posted);
    expect(sent).toEqual([{ text: 'Fixed in web-app #2841' }]);
  });

  it('AC-42: a refused post says why in the tool’s words, keeps the text, and can be pressed again', async () => {
    serve(withThread, { result: 'failed', reason: 'is_archived' });
    const { user, callout } = await openSession();

    await user.click(within(callout).getByRole('button', { name: 'Post reply' }));

    expect(await within(callout).findByRole('alert')).toHaveTextContent("Slack didn't post it: is_archived");
    expect(within(callout).getByRole('textbox', { name: 'Reply in #web-platform' })).toHaveValue(
      `A fix is up for review: Fix the archive API ${pullUrl}`,
    );
    expect(within(callout).getByRole('button', { name: 'Post reply' })).toBeEnabled();
  });

  it('AC-43: Not now puts it away for this session', async () => {
    serve();
    const { user, callout } = await openSession();

    await user.click(within(callout).getByRole('button', { name: 'Not now' }));

    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'Tell the thread' })).not.toBeInTheDocument();
    });
  });

  it('AC-44: a session sent no thread offers no reply', async () => {
    serve({ ...withThread, context: [{ kind: 'jira', key: 'PROJ-1' }] });
    await renderApp({ route: `/sessions/${id}` });
    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByRole('form', { name: 'Tell the thread' })).not.toBeInTheDocument();
  });
});
