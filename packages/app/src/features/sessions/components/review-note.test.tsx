import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type FileDiff, type Session, type SessionChanges } from '@devhub/contracts';
import {
  makeFileDiff,
  makeReviewComment,
  makeSession,
  makeSessionChanges,
  makeSessionReview,
} from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const worktreePath = '/Users/you/.devhub/worktrees/0123456789abcdef';
const contentList = makeFileDiff();

/** The session, its changes and each file's diff as the server holds them; `asked` lists the diffs the page read. */
function serve(session: Session, changes: SessionChanges | 'fails', diffs: Record<string, FileDiff> = {}) {
  const state = { changes, asked: [] as string[], reads: 0 };
  server.use(
    sessionHandler(session),
    http.get(apiUrl(apiRoutes.sessionChanges), () => {
      state.reads += 1;
      return state.changes === 'fails'
        ? HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 })
        : HttpResponse.json(state.changes);
    }),
    http.get(apiUrl(apiRoutes.sessionChangesDiff), ({ request }) => {
      const path = new URL(request.url).searchParams.get('path') ?? '';
      state.asked.push(path);
      const diff = diffs[path];
      return diff === undefined
        ? HttpResponse.json({ code: 'not_found', message: 'x' }, { status: 404 })
        : HttpResponse.json(diff);
    }),
  );
  return state;
}

describe("a review's comments in the Changes tab (spec 050)", () => {
  const path = 'src/content/ContentList.tsx';
  const kept = makeReviewComment({ id: 'c1', path, line: 43, side: 'new', text: 'Nothing calls archive yet.' });
  const dropped = makeReviewComment({ id: 'c2', path, line: 42, side: 'old', text: 'Why drop rows?', keep: false });
  const posted = makeReviewComment({
    id: 'c3',
    path,
    line: 55,
    side: 'new',
    text: 'Check each row.',
    postedAt: '2026-11-01T09:00:00.000Z',
  });

  /** A done review of these comments, as the server holds it; a PATCH changes it and is kept in `sent`. */
  function serveReview(comments = [kept, dropped, posted]) {
    let session = makeSession({
      id,
      state: 'done',
      mode: 'ask',
      worktreePath,
      review: makeSessionReview({ comments }),
    });
    const sent: unknown[] = [];
    serve(session, makeSessionChanges(), { [path]: contentList });
    server.use(
      http.get(apiUrl(apiRoutes.session), () => HttpResponse.json(session)),
      http.patch(apiUrl(apiRoutes.sessionReviewComment), async ({ request, params }) => {
        const change = (await request.json()) as { keep?: boolean; text?: string };
        sent.push({ comment: params['commentId'], ...change });
        const review = session.review ?? makeSessionReview();
        session = {
          ...session,
          review: {
            ...review,
            comments: review.comments.map((one) => (one.id === params['commentId'] ? { ...one, ...change } : one)),
          },
        };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    return sent;
  }

  it('AC-8: shows each comment under its line, and how many each file has', async () => {
    serveReview();
    await renderApp({ route: `/sessions/${id}` });

    const list = await screen.findByRole('list', { name: 'Changed files' });
    expect(within(list).getByRole('button', { name: /^src\/content\/ContentList\.tsx/ })).toHaveAccessibleName(
      /, 3 comments$/,
    );
    const note = await screen.findByRole('article', { name: `Claude on ${path}:43` });
    expect(note).toHaveTextContent('Nothing calls archive yet.');
    expect(within(note).getByRole('checkbox', { name: 'Keep' })).toBeChecked();
    expect(
      within(screen.getByRole('article', { name: `Claude on ${path}:42` })).getByRole('checkbox', { name: 'Keep' }),
    ).not.toBeChecked();
    // A posted one says so, and is past changing.
    const sent = screen.getByRole('article', { name: `Claude on ${path}:55` });
    expect(sent).toHaveTextContent('Posted');
    expect(within(sent).queryByRole('checkbox')).toBeNull();
    expect(within(sent).queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('AC-12: unticking Keep and saving an edit tell the server, and the note reads what it saved', async () => {
    const sent = serveReview();
    const { user } = await renderApp({ route: `/sessions/${id}` });
    const note = await screen.findByRole('article', { name: `Claude on ${path}:43` });

    await user.click(within(note).getByRole('checkbox', { name: 'Keep' }));
    await waitFor(() => {
      expect(within(note).getByRole('checkbox', { name: 'Keep' })).not.toBeChecked();
    });

    await user.click(within(note).getByRole('button', { name: 'Edit' }));
    const box = within(note).getByRole('textbox', { name: 'Comment' });
    expect(box).toHaveFocus();
    await user.clear(box);
    await user.click(within(note).getByRole('button', { name: 'Save' }));
    expect(within(note).getByText('Write a comment.')).toBeVisible();

    await user.type(box, 'Wire archive to the toolbar.');
    await user.click(within(note).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(note).toHaveTextContent('Wire archive to the toolbar.');
    });
    expect(within(note).getByRole('button', { name: 'Edit' })).toHaveFocus();
    expect(sent).toEqual([
      { comment: 'c1', keep: false },
      { comment: 'c1', text: 'Wire archive to the toolbar.' },
    ]);
  });

  it('AC-24: Cancel keeps the words, and Tab moves from Keep to Edit', async () => {
    const sent = serveReview([kept]);
    const { user } = await renderApp({ route: `/sessions/${id}` });
    const note = await screen.findByRole('article', { name: `Claude on ${path}:43` });

    within(note).getByRole('checkbox', { name: 'Keep' }).focus();
    await user.tab();
    expect(within(note).getByRole('button', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.type(within(note).getByRole('textbox', { name: 'Comment' }), ' More.');
    await user.click(within(note).getByRole('button', { name: 'Cancel' }));
    expect(note).toHaveTextContent('Nothing calls archive yet.');
    expect(within(note).getByRole('button', { name: 'Edit' })).toHaveFocus();
    expect(sent).toEqual([]);
  });
});
