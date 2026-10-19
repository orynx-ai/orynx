import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes, type CreatePullRequestAnswer, type PullRequestDraftAnswer, type Session } from '@devhub/contracts';
import {
  makePullRequestDraft,
  makeSession,
  makeSessionChanges,
  makeSessionPullRequest,
} from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { initialPullRequestDrafts, usePullRequestDrafts } from '../store.ts';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const done = makeSession({
  id,
  state: 'done',
  step: 'review',
  worktreePath: '/Users/you/.devhub/worktrees/0123456789abcdef',
});

const withChanges = () => http.get(apiUrl(apiRoutes.sessionChanges), () => HttpResponse.json(makeSessionChanges()));

beforeEach(() => {
  usePullRequestDrafts.setState(initialPullRequestDrafts);
  // Claude changed files, so there's something to put in a pull request.
  server.use(withChanges());
});

type Answer<T> = T | 'fails' | 'slow';

/** The session, its draft and its creation, each answered as asked; gives back what the page sent. */
function serve(
  session: Session,
  {
    draft = makePullRequestDraft(),
    create = { result: 'opened', number: 2841, url: 'https://github.com/acme/web-app/pull/2841', linked: false },
  }: { draft?: Answer<PullRequestDraftAnswer>; create?: Answer<CreatePullRequestAnswer> } = {},
) {
  const sent = { drafts: 0, creates: [] as unknown[] };
  const answer = async (given: Answer<PullRequestDraftAnswer | CreatePullRequestAnswer>) => {
    if (given === 'fails') return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
    if (given === 'slow') {
      await delay('infinite');
      return HttpResponse.json({});
    }
    return HttpResponse.json(given);
  };
  server.use(
    sessionHandler(session),
    http.post(apiUrl(apiRoutes.sessionPullRequestDraft), () => {
      sent.drafts += 1;
      return answer(draft);
    }),
    http.post(apiUrl(apiRoutes.sessionPullRequest), async ({ request }) => {
      sent.creates.push(await request.json());
      return answer(create);
    }),
  );
  return sent;
}

const createButton = () => screen.getByRole('button', { name: 'Create pull request' });
const dialog = () => screen.getByRole('dialog', { name: 'Create pull request' });

describe('Create pull request (spec 014)', () => {
  it('AC-1, Q2: sits in the title row once Claude is done, and not while it works, after Discard or once a PR is open', async () => {
    serve(done);
    const first = await renderApp({ route });
    expect(await screen.findByRole('button', { name: 'Create pull request' })).toBeVisible();
    first.unmount();

    for (const session of [
      makeSession({ ...done, state: 'working' }),
      makeSession({ ...done, state: 'stopped', discardedAt: '2026-10-18T10:00:00.000Z' }),
      makeSession({ ...done, state: 'pr_open', pullRequest: makeSessionPullRequest() }),
      makeSession({ ...done, worktreePath: null }),
    ]) {
      serve(session);
      const { unmount } = await renderApp({ route });
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('button', { name: 'Create pull request' })).toBeNull();
      unmount();
    }

    // Nothing changed in the worktree: nothing to put in a pull request (the user's call, 19 Oct 2026).
    serve(done);
    server.use(
      http.get(apiUrl(apiRoutes.sessionChanges), () =>
        HttpResponse.json({ state: 'ready', files: [], moreFiles: 0, added: 0, removed: 0 }),
      ),
    );
    await renderApp({ route });
    expect(await screen.findByText('No changes yet')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create pull request' })).toBeNull();
  });

  it('AC-2, AC-3, AC-23: opens at once, drafts with skeletons, then fills the fields and starts on the title', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      sessionHandler(done),
      http.post(apiUrl(apiRoutes.sessionPullRequestDraft), async () => {
        await held;
        return HttpResponse.json(makePullRequestDraft());
      }),
    );
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));

    expect(within(dialog()).getByRole('status')).toHaveTextContent('Claude is drafting the title and description…');
    expect(within(dialog()).queryByRole('textbox')).toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Create pull request' })).toBeDisabled();

    release();
    const title = await within(dialog()).findByRole('textbox', { name: 'Title' });
    expect(title).toHaveValue('PROJ-1423: Add bulk archive to the content list');
    expect(within(dialog()).getByRole('textbox', { name: 'Description' })).toHaveValue(makePullRequestDraft().body);
    expect(within(dialog()).getByRole('textbox', { name: 'Description' })).toHaveAccessibleDescription(
      'Markdown, as on GitHub.',
    );
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
    expect(dialog()).toHaveAccessibleDescription('acme/web-app · feat/PROJ-1423 → main');
    expect(
      within(dialog()).getByText(
        'Orynx commits 4 changed files, pushes feat/PROJ-1423 to acme/web-app and opens the pull request.',
      ),
    ).toBeVisible();
  });

  it('AC-4: Create sends your title and description, waits busy and read-only, then closes', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sent: unknown[] = [];
    server.use(
      sessionHandler(done),
      http.post(apiUrl(apiRoutes.sessionPullRequestDraft), () => HttpResponse.json(makePullRequestDraft())),
      http.post(apiUrl(apiRoutes.sessionPullRequest), async ({ request }) => {
        sent.push(await request.json());
        await held;
        return HttpResponse.json({
          result: 'opened',
          number: 2841,
          url: 'https://github.com/acme/web-app/pull/2841',
          linked: false,
        });
      }),
    );
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    const title = await within(dialog()).findByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'PROJ-1423: Bulk archive');
    await user.click(within(dialog()).getByRole('button', { name: 'Create pull request' }));

    const busy = await within(dialog()).findByRole('button', { name: /Creating…/ });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(title).toHaveAttribute('readonly');
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(sent).toEqual([{ title: 'PROJ-1423: Bulk archive', body: makePullRequestDraft().body }]);

    release();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it("AC-6: says when Claude couldn't draft it, and starts from the ticket", async () => {
    serve(done, { draft: makePullRequestDraft({ byClaude: false }) });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    expect(
      await within(dialog()).findByText(
        "Claude couldn't draft this, so it starts from the ticket and Claude's summary.",
      ),
    ).toBeVisible();
  });

  it('AC-7: says why there can’t be a pull request, with Settings linked when GitHub isn’t connected', async () => {
    serve(done, { draft: { result: 'cannot', reason: 'not_connected' } });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    expect(await within(dialog()).findByText(/Connect GitHub to open pull requests\./)).toBeVisible();
    expect(within(dialog()).getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings/connections',
    );
    expect(within(dialog()).queryByRole('button', { name: 'Create pull request' })).toBeNull();
  });

  it('AC-8: a failure says why under the fields, keeps your edits, and Create is ready again', async () => {
    serve(done, { create: { result: 'failed', problem: { kind: 'secret', path: '.env.local' } } });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    const title = await within(dialog()).findByRole('textbox', { name: 'Title' });
    await user.type(title, ' (edited)');
    await user.click(within(dialog()).getByRole('button', { name: 'Create pull request' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      "Couldn't commit .env.local: it looks like a secret. Delete it or add it to .gitignore, then try again.",
    );
    expect(title).toHaveValue('PROJ-1423: Add bulk archive to the content list (edited)');
    expect(within(dialog()).getByRole('button', { name: 'Create pull request' })).not.toHaveAttribute('aria-disabled');
  });

  it("AC-10: single sign-on links GitHub's own page, opened outside Orynx", async () => {
    const sso = 'https://github.com/orgs/acme/sso?authorization_request=A1';
    serve(done, { create: { result: 'failed', problem: { kind: 'github_sso', url: sso } } });
    const { user, platform } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    await within(dialog()).findByRole('textbox', { name: 'Title' });
    await user.click(within(dialog()).getByRole('button', { name: 'Create pull request' }));
    await user.click(await within(dialog()).findByRole('link', { name: 'Authorize' }));
    expect(platform.openExternal).toHaveBeenCalledWith(sso);
  });

  it("says when Orynx's server didn't answer the press, and keeps the dialog", async () => {
    serve(done, { create: 'fails' });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    await within(dialog()).findByRole('textbox', { name: 'Title' });
    await user.click(within(dialog()).getByRole('button', { name: 'Create pull request' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      "Couldn't create the pull request. Try again.",
    );
  });

  it('Q11d: an empty title sends nothing and says so', async () => {
    const sent = serve(done);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    await user.clear(await within(dialog()).findByRole('textbox', { name: 'Title' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Create pull request' }));
    expect(await within(dialog()).findByText('Give the pull request a title.')).toBeVisible();
    expect(sent.creates).toEqual([]);
  });

  it('AC-21: Enter in the title sends nothing, Enter in the description adds a line, Escape closes back to the button', async () => {
    const sent = serve(done);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    const title = await within(dialog()).findByRole('textbox', { name: 'Title' });
    await waitFor(() => {
      expect(title).toHaveFocus();
    });
    await user.keyboard('{Enter}');
    expect(sent.creates).toEqual([]);
    await user.tab();
    const description = within(dialog()).getByRole('textbox', { name: 'Description' });
    expect(description).toHaveFocus();
    await user.clear(description);
    await user.type(description, 'One{Enter}Two');
    expect(description).toHaveValue('One\nTwo');
    await user.tab();
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(within(dialog()).getByRole('button', { name: 'Create pull request' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(createButton()).toHaveFocus();
  });

  it('Q10h: closing keeps your edits, and opening again asks Claude nothing more', async () => {
    const sent = serve(done);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    const title = await within(dialog()).findByRole('textbox', { name: 'Title' });
    await user.clear(title);
    await user.type(title, 'Mine');
    await user.keyboard('{Escape}');
    await user.click(createButton());
    expect(await within(dialog()).findByRole('textbox', { name: 'Title' })).toHaveValue('Mine');
    expect(sent.drafts).toBe(1);
  });

  it("says when the draft couldn't be had, and Try again asks again", async () => {
    const sent = serve(done, { draft: 'fails' });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    expect(await within(dialog()).findByText("Couldn't get a draft.")).toBeVisible();
    serve(done);
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog()).findByRole('textbox', { name: 'Title' })).toBeVisible();
    expect(sent.drafts).toBe(1);
  });
});

describe('once the pull request is open (spec 014, Q7)', () => {
  const url = 'https://github.com/acme/web-app/pull/2841';
  const pr = `#${String(2841)}`;
  const opened = makeSession({
    ...done,
    state: 'pr_open',
    step: 'pull_request',
    pullRequest: makeSessionPullRequest(),
    activities: [
      { id: 'step-1', state: 'done', kind: 'finished', summary: 'Added row selection.' },
      {
        id: 'step-2',
        state: 'done',
        kind: 'pull_request',
        number: 2841,
        url,
        files: 4,
        branch: 'feat/PROJ-1423',
        linked: false,
      },
    ],
  });

  it('AC-4, AC-16: the title row has Open PR, which opens GitHub outside Orynx, and the step links the PR too', async () => {
    serve(opened);
    const { user, platform } = await renderApp({ route });
    const openPr = await screen.findByRole('link', { name: `Open PR ${pr}` });
    expect(openPr).toHaveAttribute('href', url);
    await user.click(openPr);
    expect(platform.openExternal).toHaveBeenCalledWith(url);

    expect(screen.getByText(`Opened pull request`, { exact: false })).toBeVisible();
    const stepLink = screen.getByRole('link', { name: pr });
    expect(stepLink).toHaveAttribute('href', url);
    await user.click(stepLink);
    expect(platform.openExternal).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Committed 4 files and pushed feat/PROJ-1423')).toBeVisible();
  });

  it('AC-18, AC-20: Open PR stays after Discard, without Push changes', async () => {
    serve(makeSession({ ...opened, state: 'stopped', discardedAt: '2026-10-18T10:00:00.000Z', worktreePath: null }));
    await renderApp({ route });
    expect(await screen.findByRole('link', { name: `Open PR ${pr}` })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Push changes' })).toBeNull();
  });

  it('AC-4: when the session says PR open before Create answers, the dialog waits for the answer, then focus moves on', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      sessionHandler(done),
      http.post(apiUrl(apiRoutes.sessionPullRequestDraft), () => HttpResponse.json(makePullRequestDraft())),
    );
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    await within(dialog()).findByRole('textbox', { name: 'Title' });
    server.use(
      sessionHandler(opened),
      http.post(apiUrl(apiRoutes.sessionPullRequest), async () => {
        await held;
        return HttpResponse.json({ result: 'opened', number: 2841, url, linked: false });
      }),
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Create pull request' }));
    FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });
    await screen.findByRole('link', { name: `Open PR ${pr}`, hidden: true });
    // The title row no longer offers Create, but the dialog stays, busy, until the answer comes.
    expect(within(dialog()).getByRole('button', { name: /Creating…/ })).toBeVisible();

    release();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: `Open PR ${pr}` })).toHaveFocus();
    });
  });

  it('AC-4: once the pull request opens, focus moves to Open PR', async () => {
    serve(done);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Create pull request' }));
    await within(dialog()).findByRole('textbox', { name: 'Title' });
    // The server opens it, then says the session changed.
    serve(opened);
    await user.click(within(dialog()).getByRole('button', { name: 'Create pull request' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: `Open PR ${pr}` })).toHaveFocus();
    });
  });
});
