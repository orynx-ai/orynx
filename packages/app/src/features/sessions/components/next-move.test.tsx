import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Session } from '@devhub/contracts';
import { makePushDraft, makeSession, makeSessionChanges, makeSessionPullRequest } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const worktreePath = '/Users/you/.devhub/worktrees/0123456789abcdef';
/** Claude is done on your pull request's branch, and the worktree has 4 files GitHub doesn't. */
const unpushed = makeSession({
  id,
  state: 'pr_open',
  step: 'pull_request',
  worktreePath,
  pullRequest: makeSessionPullRequest(),
});

/** The session and its changes; gives back the pushes the page sent. */
function serve(session: Session) {
  const pushed: unknown[] = [];
  server.use(
    sessionHandler(session),
    http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
    http.post(apiUrl(apiRoutes.sessionPushDraft), () => HttpResponse.json(makePushDraft())),
    http.post(apiUrl(apiRoutes.sessionPush), async ({ request }) => {
      pushed.push(await request.json());
      return HttpResponse.json({ result: 'pushed', files: 4 });
    }),
  );
  return pushed;
}

const bar = () => screen.getByRole('status', { name: /^(Ready|Pushed)/ });

describe('the next-move bar (spec 048)', () => {
  it('AC-1, AC-2: says it is ready to push, with Push to PR as the page’s one primary button, which opens the Push dialog', async () => {
    const pushed = serve(unpushed);
    const { user, container } = await renderApp({ route });

    expect(await screen.findByText('4 files, +142 −18. Nothing leaves your machine until you push.')).toBeVisible();
    expect(bar()).toHaveTextContent(/^Ready to push/);
    const push = within(bar()).getByRole('button', { name: 'Push to PR #2841' });
    // The page bar has no button of its own for it.
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /Push/ })).toBeNull();
    await expectNoAxeViolations(container);

    await user.click(push);
    expect(await screen.findByRole('dialog', { name: 'Push changes' })).toBeVisible();
    expect(pushed).toEqual([]);
  });

  it('AC-3: once GitHub has everything, says it was pushed, in green, with no button', async () => {
    serve(makeSession({ ...unpushed, unpushed: false }));
    await renderApp({ route });
    expect(await screen.findByText('GitHub has everything from this worktree.')).toBeVisible();
    expect(bar()).toHaveTextContent(/^Pushed to PR #2841/);
    expect(within(bar()).queryByRole('button')).toBeNull();
  });

  it('AC-4: a done Build with changes and no pull request is ready for one, and Create pull request opens its dialog', async () => {
    serve(makeSession({ id, state: 'done', step: 'review', worktreePath }));
    server.use(
      http.post(apiUrl(apiRoutes.sessionPullRequestDraft), () =>
        HttpResponse.json({ result: 'cannot', reason: 'no_origin' }),
      ),
    );
    const { user } = await renderApp({ route });
    expect(
      await screen.findByText('4 files, +142 −18. Nothing leaves your machine until you create it.'),
    ).toBeVisible();
    expect(bar()).toHaveTextContent(/^Ready for a pull request/);
    await user.click(within(bar()).getByRole('button', { name: 'Create pull request' }));
    expect(await screen.findByRole('dialog', { name: 'Create pull request' })).toBeVisible();
  });

  it('AC-5: says nothing once the pull request is merged or closed (spec 047)', async () => {
    for (const state of ['pr_merged', 'pr_closed'] as const) {
      serve(makeSession({ ...unpushed, state, unpushed: false }));
      const { unmount } = await renderApp({ route });
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('status', { name: /^(Ready|Pushed)/ })).toBeNull();
      unmount();
    }
  });

  it('AC-5: shows nothing while Claude works or waits for you, once stopped with nothing to push, or for an Ask', async () => {
    for (const session of [
      makeSession({ ...unpushed, state: 'working' }),
      makeSession({ ...unpushed, state: 'needs_you' }),
      makeSession({ id, state: 'stopped', step: 'build', worktreePath, discardedAt: '2026-10-18T10:00:00.000Z' }),
      makeSession({ id, state: 'done', step: 'answer', mode: 'ask', worktreePath: null }),
    ]) {
      serve(session);
      const { unmount } = await renderApp({ route });
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('status', { name: /^(Ready|Pushed)/ })).toBeNull();
      unmount();
    }
  });
});
