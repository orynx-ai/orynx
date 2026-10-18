import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PushAnswer, type PushDraftAnswer, type Session } from '@devhub/contracts';
import { makePushDraft, makeSession, makeSessionPullRequest } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const open = makeSession({
  id,
  state: 'pr_open',
  step: 'pull_request',
  worktreePath: '/Users/you/.devhub/worktrees/0123456789abcdef',
  pullRequest: makeSessionPullRequest(),
});
const pr = `#${String(2841)}`;

/** The session, its commit message and its push, answered as asked; gives back what the page sent. */
function serve(
  session: Session,
  {
    draft = makePushDraft(),
    push = { result: 'pushed', files: 2 },
  }: { draft?: PushDraftAnswer; push?: PushAnswer | 'slow' | 'fails' } = {},
) {
  const sent: unknown[] = [];
  server.use(
    sessionHandler(session),
    http.post(apiUrl(apiRoutes.sessionPushDraft), () => HttpResponse.json(draft)),
    http.post(apiUrl(apiRoutes.sessionPush), async ({ request }) => {
      sent.push(await request.json());
      if (push === 'fails') return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      if (push === 'slow') await delay('infinite');
      return HttpResponse.json(push);
    }),
  );
  return sent;
}

const dialog = () => screen.getByRole('dialog', { name: 'Push changes' });

describe('Push changes (spec 014, Q7)', () => {
  it('AC-17: sits in the title row once the pull request is open, and not while Claude works or after Discard', async () => {
    serve(open);
    const first = await renderApp({ route });
    expect(await screen.findByRole('button', { name: 'Push changes' })).toBeVisible();
    first.unmount();
    for (const session of [
      makeSession({ ...open, state: 'working' }),
      makeSession({ ...open, state: 'stopped', discardedAt: '2026-10-18T10:00:00.000Z' }),
    ]) {
      serve(session);
      const { unmount } = await renderApp({ route });
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('button', { name: 'Push changes' })).toBeNull();
      unmount();
    }
  });

  it("AC-17: drafts Claude's commit message, says what will happen, and pushes what you leave", async () => {
    const sent = serve(open);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Push changes' }));
    const message = await within(dialog()).findByRole('textbox', { name: 'Commit message' });
    expect(message).toHaveValue('Use the existing useSelection hook in the content list');
    await waitFor(() => {
      expect(message).toHaveFocus();
    });
    expect(
      within(dialog()).getByText(
        `Orynx commits 2 changed files and pushes them to feat/PROJ-1423, which updates pull request ${pr}.`,
      ),
    ).toBeVisible();
    await user.keyboard('{Enter}');
    expect(sent).toEqual([]);
    await user.click(within(dialog()).getByRole('button', { name: 'Push changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent).toEqual([{ message: 'Use the existing useSelection hook in the content list' }]);
  });

  it('AC-17: waits busy while it pushes', async () => {
    serve(open, { push: 'slow' });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Push changes' }));
    await within(dialog()).findByRole('textbox', { name: 'Commit message' });
    await user.click(within(dialog()).getByRole('button', { name: 'Push changes' }));
    expect(await within(dialog()).findByRole('button', { name: /Pushing…/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it("AC-17: says there's nothing new to push", async () => {
    serve(open, { draft: { result: 'nothing_new' } });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Push changes' }));
    expect(
      await within(dialog()).findByText('Nothing new to push: GitHub already has everything in the worktree.'),
    ).toBeVisible();
    expect(within(dialog()).queryByRole('button', { name: 'Push changes' })).toBeNull();
  });

  it('AC-8, AC-9: says why a push failed, and keeps the message', async () => {
    serve(open, { push: { result: 'failed', problem: { kind: 'push_rejected' } } });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Push changes' }));
    const message = await within(dialog()).findByRole('textbox', { name: 'Commit message' });
    await user.type(message, '!');
    await user.click(within(dialog()).getByRole('button', { name: 'Push changes' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      "acme/web-app already has feat/PROJ-1423 with commits this worktree doesn't have. Orynx never overwrites them.",
    );
    expect(message).toHaveValue('Use the existing useSelection hook in the content list!');
  });

  it("says when Orynx's server didn't answer the press, or the worktree is gone", async () => {
    serve(open, { push: 'fails' });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Push changes' }));
    await within(dialog()).findByRole('textbox', { name: 'Commit message' });
    await user.click(within(dialog()).getByRole('button', { name: 'Push changes' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent("Couldn't push the changes. Try again.");
    await user.keyboard('{Escape}');

    serve(open, { draft: { result: 'cannot', reason: 'missing' } });
    await user.click(screen.getByRole('button', { name: 'Push changes' }));
    expect(
      await within(dialog()).findByText('The worktree is missing. It was moved or deleted outside Orynx.'),
    ).toBeVisible();
  });

  it('Q11d: an empty commit message sends nothing and says so', async () => {
    const sent = serve(open);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Push changes' }));
    await user.clear(await within(dialog()).findByRole('textbox', { name: 'Commit message' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Push changes' }));
    expect(await within(dialog()).findByText('Write a commit message.')).toBeVisible();
    expect(sent).toEqual([]);
  });
});
