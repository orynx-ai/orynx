import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Session } from '@devhub/contracts';
import { makeSession, makeSessionPullRequest } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

type User = Awaited<ReturnType<typeof renderApp>>['user'];

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const done = makeSession({
  id,
  title: 'Add bulk archive to the content list',
  state: 'done',
  branch: 'feat/PROJ-1423',
  activities: [{ id: 'step-1', state: 'done', kind: 'finished', summary: 'Added a button.' }],
});

/** The session as the server holds it, and every discard the page asks for. */
function serve(initial: Session, { fails = false } = {}) {
  const state = { current: initial, discards: 0 };
  server.use(
    http.get(apiUrl(apiRoutes.session), () => HttpResponse.json(state.current)),
    http.post(apiUrl(apiRoutes.sessionDiscard), () => {
      state.discards += 1;
      if (fails) return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      state.current = {
        ...state.current,
        state: 'stopped',
        discardedAt: '2026-10-16T10:05:00.000Z',
        activities: [
          ...state.current.activities,
          { id: 'step-2', state: 'done', kind: 'discarded', branch: 'feat/PROJ-1423' },
        ],
      };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

const moreActions = () => within(screen.getByRole('banner')).getByRole('button', { name: 'More actions' });

/** Discard changes, from More actions in the page bar (the user's call, 19 Oct 2026). */
async function pickDiscard(user: User) {
  await waitFor(() => {
    expect(moreActions()).toBeVisible();
  });
  await user.click(moreActions());
  await user.click(screen.getByRole('menuitem', { name: 'Discard changes' }));
}

describe('DiscardSession', () => {
  it('AC-10 (Q10e): asks first in the page, with focus on Cancel', async () => {
    serve(done);
    const { user } = await renderApp({ route });

    await pickDiscard(user);

    const dialog = screen.getByRole('dialog', { name: "Discard Claude's changes?" });
    expect(dialog).toHaveAccessibleDescription(
      "This deletes the worktree and the branch feat/PROJ-1423. The changes can't be brought back.",
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('AC-10: deletes the worktree and branch on confirm, then says so, and the title takes focus', async () => {
    const held = serve(done);
    const { user } = await renderApp({ route });
    await pickDiscard(user);

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }));
    FakeEventSource.latest().emit({ type: 'sessions.changed' });

    expect(held.discards).toBe(1);
    expect(await screen.findByText('Discarded the changes')).toBeVisible();
    expect(screen.getByText('The worktree and feat/PROJ-1423 are deleted.')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Nothing is left to open or discard, so More actions goes too.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Add bulk archive to the content list' })).toHaveFocus();
    });
  });

  it.each(['Cancel', 'Esc'])(
    'AC-10, AC-18: %s closes the dialog, gives focus back to More actions, and deletes nothing',
    async (how) => {
      const held = serve(done);
      const { user } = await renderApp({ route });
      await pickDiscard(user);

      if (how === 'Esc') await user.keyboard('{Escape}');
      else await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(moreActions()).toHaveFocus();
      expect(held.discards).toBe(0);
    },
  );

  it('says when it couldn’t discard, and keeps the dialog open to try again', async () => {
    serve(done, { fails: true });
    const { user } = await renderApp({ route });
    await pickDiscard(user);
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));

    expect(await within(dialog).findByText("Couldn't discard the changes.")).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toBeVisible();
  });

  it('AC-10: has nothing to discard once discarded, so no More actions', async () => {
    server.use(sessionHandler({ ...done, discardedAt: '2026-10-16T10:05:00.000Z', state: 'stopped' }));
    await renderApp({ route });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('has no Discard before the worktree was made', async () => {
    server.use(
      sessionHandler({
        ...done,
        branch: null,
        worktreePath: '/Users/you/.devhub/worktrees/x',
        state: 'stopped',
        problem: { kind: 'jira', stage: 'starting' },
      }),
    );
    const { user } = await renderApp({ route });
    await waitFor(() => {
      expect(moreActions()).toBeVisible();
    });
    await user.click(moreActions());
    expect(screen.getByRole('menuitem', { name: 'Open in VS Code' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Discard changes' })).toBeNull();
  });
});

describe('Discard once a pull request is open (spec 014)', () => {
  it('AC-18 (Q11g): the confirm says the pull request and the branch on GitHub stay', async () => {
    serve(makeSession({ ...done, state: 'pr_open', pullRequest: makeSessionPullRequest() }));
    const { user } = await renderApp({ route });
    await pickDiscard(user);
    const confirm = screen.getByRole('dialog', { name: "Discard Claude's changes?" });
    expect(confirm).toHaveAccessibleDescription(
      `This deletes the worktree and the branch feat/PROJ-1423. The changes can't be brought back. Pull request #${String(2841)} and the branch on GitHub stay.`,
    );
  });
});
