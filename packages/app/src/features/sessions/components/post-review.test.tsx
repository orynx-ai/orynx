import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ReviewComment, type Session } from '@devhub/contracts';
import { makeReviewComment, makeSession, makeSessionChanges, makeSessionReview } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const url = 'https://github.com/acme/web-app/pull/2841#pullrequestreview-1';

const eight = Array.from({ length: 8 }, (_, index) =>
  makeReviewComment({ id: `c${String(index + 1)}`, line: index + 1, keep: index !== 7 }),
);

/** A review as the server holds it, its status, and what Post review sends; posting marks the kept ones posted. */
function serve(
  {
    state = 'done',
    comments = eight,
    posted = [],
    verdict = 'request_changes',
  }: {
    state?: Session['state'];
    comments?: ReviewComment[];
    posted?: { url: string; at: string }[];
    verdict?: 'approve' | 'comment' | 'request_changes' | null;
  } = {},
  { pushed = 0, answer }: { pushed?: number; answer?: object } = {},
) {
  let session = makeSession({
    id,
    state,
    mode: 'ask',
    worktreePath: `/Users/you/.devhub/worktrees/${id}`,
    review: makeSessionReview({ comments, posted, verdict, summary: 'Two bugs in the error path.' }),
  });
  const sent: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.session), () => HttpResponse.json(session)),
    http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges())),
    http.get(apiUrl(apiRoutes.sessionReviewStatus), () => HttpResponse.json({ result: 'ready', pushed })),
    http.post(apiUrl(apiRoutes.sessionReview), async ({ request }) => {
      sent.push(await request.json());
      if (answer !== undefined) return HttpResponse.json(answer);
      await delay(20);
      const review = session.review ?? makeSessionReview();
      const at = '2026-11-02T10:00:00.000Z';
      session = {
        ...session,
        review: {
          ...review,
          comments: review.comments.map((one) => (one.keep && one.postedAt === null ? { ...one, postedAt: at } : one)),
          posted: [...review.posted, { url, at }],
        },
      };
      return HttpResponse.json({ result: 'posted', url, comments: 7 });
    }),
  );
  return sent;
}

const bar = (name: RegExp) => screen.findByRole('status', { name });

describe('the next move for a review (spec 050)', () => {
  it('AC-11: once Claude is done, says how many comments it left, with Post review', async () => {
    serve();
    await renderApp({ route });
    const move = await bar(/^Claude left/);
    expect(move).toHaveTextContent('Claude left 8 comments');
    expect(within(move).getByRole('button', { name: 'Post review' })).toBeVisible();
    // Never a pull request of its own.
    expect(screen.queryByRole('button', { name: 'Create pull request' })).toBeNull();
  });

  it('AC-13: with no comments it says Claude found nothing, and still offers Post review', async () => {
    serve({ comments: [] });
    await renderApp({ route });
    expect(await bar(/^Claude found nothing/)).toHaveTextContent('Claude found nothing to comment on.');
  });

  it('AC-22: shows after Stop too, and nothing while Claude works', async () => {
    serve({ state: 'stopped', comments: eight.slice(0, 3) });
    const { unmount } = await renderApp({ route });
    expect(await bar(/^Claude left/)).toHaveTextContent('Claude left 3 comments');
    unmount();

    serve({ state: 'working', comments: eight.slice(0, 3) });
    await renderApp({ route });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('status', { name: /^Claude left/ })).toBeNull();
  });
});

describe('Post review (spec 050)', () => {
  it('AC-14: opens with Claude’s summary, on Comment, with Claude’s verdict and how many comments go', async () => {
    serve();
    const { user } = await renderApp({ route });
    await user.click(within(await bar(/^Claude left/)).getByRole('button', { name: 'Post review' }));

    const dialog = await screen.findByRole('dialog', { name: 'Post your review on #2841' });
    expect(within(dialog).getByRole('textbox', { name: 'Summary' })).toHaveValue('Two bugs in the error path.');
    expect(within(dialog).getByRole('radio', { name: 'Comment' })).toBeChecked();
    expect(dialog).toHaveTextContent('Claude would request changes.');
    expect(dialog).toHaveTextContent('7 of 8 comments will be posted.');
    await expectNoAxeViolations(dialog);
  });

  it('AC-15: Comment with an empty summary says so and sends nothing', async () => {
    const sent = serve();
    const { user } = await renderApp({ route });
    await user.click(within(await bar(/^Claude left/)).getByRole('button', { name: 'Post review' }));
    const dialog = await screen.findByRole('dialog');

    await user.clear(within(dialog).getByRole('textbox', { name: 'Summary' }));
    await user.click(within(dialog).getByRole('button', { name: 'Post review' }));
    expect(await within(dialog).findByText('Write a summary to comment or request changes.')).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('AC-16, AC-21: Request changes posts your words once, closes, and the bar says Review posted with Open on GitHub', async () => {
    const sent = serve();
    const { user, platform } = await renderApp({ route });
    await user.click(within(await bar(/^Claude left/)).getByRole('button', { name: 'Post review' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('radio', { name: 'Request changes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Post review' }));
    expect(within(dialog).getByRole('button', { name: 'Posting…' })).toHaveAttribute('aria-disabled', 'true');

    const posted = await bar(/^Review posted/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toEqual([{ summary: 'Two bugs in the error path.', verdict: 'request_changes' }]);
    const open = within(posted).getByRole('button', { name: 'Open on GitHub' });
    await waitFor(() => {
      expect(open).toHaveFocus();
    });
    await user.click(open);
    expect(platform.openExternal).toHaveBeenCalledWith(url);
  });

  it('AC-18: says when the author pushed after Claude read it', async () => {
    serve({}, { pushed: 2 });
    const { user } = await renderApp({ route });
    await user.click(within(await bar(/^Claude left/)).getByRole('button', { name: 'Post review' }));
    expect(
      await within(await screen.findByRole('dialog')).findByText(
        'The author pushed 2 commits since Claude read it. The comments go on the commit Claude read.',
      ),
    ).toBeVisible();
  });

  it("AC-19, AC-20: GitHub's refusal and problems show in the dialog, which stays open", async () => {
    for (const [problem, line] of [
      [{ kind: 'github_said', message: 'Line could not be resolved' }, 'GitHub refused it: Line could not be resolved'],
      [{ kind: 'github_forbidden' }, "Your GitHub account can't review in acme/web-app."],
      [{ kind: 'github_unreachable' }, "Couldn't reach GitHub. Try again."],
    ] as const) {
      serve({}, { answer: { result: 'failed', problem } });
      const { user, unmount } = await renderApp({ route });
      await user.click(within(await bar(/^Claude left/)).getByRole('button', { name: 'Post review' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Post review' }));
      expect(await within(dialog).findByText(line)).toBeVisible();
      expect(screen.getByRole('dialog')).toBeVisible();
      unmount();
    }
  });

  it('AC-24: the verdicts move with the arrow keys, and Escape closes the dialog onto Post review', async () => {
    serve();
    const { user } = await renderApp({ route });
    const button = within(await bar(/^Claude left/)).getByRole('button', { name: 'Post review' });
    await user.click(button);
    const dialog = await screen.findByRole('dialog');

    within(dialog).getByRole('radio', { name: 'Comment' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(within(dialog).getByRole('radio', { name: 'Approve' })).toBeChecked();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });
});
