import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiRoutes, type ReplyAnswer, type ReplyDraftAnswer, type Session } from '@devhub/contracts';
import { makeReplyDraft, makeSession, makeSessionPullRequest } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
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

/** The session, Claude's replies and the post, answered as asked; gives back what the page posted. */
function serve(
  session: Session,
  {
    draft = makeReplyDraft(),
    post,
  }: { draft?: ReplyDraftAnswer | 'slow' | 'fails'; post?: ReplyAnswer | 'fails' } = {},
) {
  const sent: unknown[] = [];
  server.use(
    sessionHandler(session),
    http.post(apiUrl(apiRoutes.sessionRepliesDraft), async () => {
      if (draft === 'slow') await delay('infinite');
      if (draft === 'fails') return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      return HttpResponse.json(draft);
    }),
    http.post(apiUrl(apiRoutes.sessionReplies), async ({ request }) => {
      sent.push(await request.json());
      if (post === 'fails') return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      return HttpResponse.json(post ?? { result: 'posted', failed: [] });
    }),
  );
  return sent;
}

const dialog = () => screen.getByRole('dialog', { name: 'Reply to reviewers' });
const thread = (name: string) => within(dialog()).getByRole('group', { name });

async function openDialog() {
  const rendered = await renderApp({ route });
  await rendered.user.click(await screen.findByRole('button', { name: 'Reply to reviewers' }));
  return rendered;
}

describe('Reply to reviewers (spec 048)', () => {
  it('AC-1: sits in the page bar after Push changes while the pull request is open, and nowhere before or after', async () => {
    serve(open);
    const first = await renderApp({ route });
    const bar = await screen.findByRole('button', { name: 'Reply to reviewers' });
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons.indexOf('Reply to reviewers')).toBeGreaterThan(buttons.indexOf('Push changes'));
    expect(bar).toBeVisible();
    first.unmount();
    for (const session of [
      makeSession({ ...open, state: 'done', pullRequest: null }),
      makeSession({ ...open, state: 'pr_merged' }),
    ]) {
      serve(session);
      const { unmount } = await renderApp({ route });
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('button', { name: 'Reply to reviewers' })).toBeNull();
      unmount();
    }
  });

  it('AC-1: under 768 px it’s in More actions, and opens the dialog from there', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    serve(open);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reply to reviewers' }));
    expect(await screen.findByRole('dialog', { name: 'Reply to reviewers' })).toBeVisible();
  });

  it('AC-2, AC-20: holds each thread’s place while Claude drafts, then shows every thread with its reply', async () => {
    serve(open, { draft: 'slow' });
    await openDialog();
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Claude is drafting replies…');
    expect(within(dialog()).getByRole('button', { name: 'Post replies' })).toBeDisabled();
    await expectNoAxeViolations(dialog());
  });

  it('AC-2: shows each unresolved thread’s file, line and last comment, Claude’s reply, and Resolve ticked for it', async () => {
    serve(open);
    await openDialog();

    const replied = await within(await screen.findByRole('dialog', { name: 'Reply to reviewers' })).findByRole(
      'group',
      { name: 'src/ContentList.tsx line 42' },
    );
    expect(within(replied).getByText('priya')).toBeVisible();
    expect(within(replied).getByText('Use the existing useSelection hook here.')).toBeVisible();
    expect(within(replied).getByRole('textbox', { name: 'Reply' })).toHaveValue(
      'Done: the list uses useSelection now.',
    );
    expect(within(replied).getByRole('checkbox', { name: 'Resolve' })).toBeChecked();

    const left = thread('src/api.ts line 7');
    expect(within(left).getByRole('textbox', { name: 'Reply' })).toHaveValue('');
    expect(within(left).getByRole('checkbox', { name: 'Resolve' })).not.toBeChecked();
    expect(within(dialog()).getByText('acme/web-app #2841')).toBeVisible();
    await expectNoAxeViolations(dialog());
  });

  it('AC-3: posts the replies as you left them, leaves the untouched thread out, and closes', async () => {
    const sent = serve(open);
    const { user } = await openDialog();
    const reply = within(
      await within(await screen.findByRole('dialog', { name: 'Reply to reviewers' })).findByRole('group', {
        name: 'src/ContentList.tsx line 42',
      }),
    ).getByRole('textbox', { name: 'Reply' });
    await user.clear(reply);
    await user.type(reply, 'Done: it uses useSelection.');
    await user.click(within(dialog()).getByRole('button', { name: 'Post replies' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Reply to reviewers' })).toBeNull();
    });
    expect(sent).toEqual([{ threads: [{ id: 'PRRT_kwDOAbc1', reply: 'Done: it uses useSelection.', resolve: true }] }]);
    expect(screen.getByRole('button', { name: 'Reply to reviewers' })).toHaveFocus();
  });

  it('AC-4: when Claude couldn’t draft, says so, and Post replies waits for a reply or a tick', async () => {
    const draft = makeReplyDraft({
      byClaude: false,
      threads: makeReplyDraft().threads.map((one) => ({ ...one, reply: '', resolve: false })),
    });
    const sent = serve(open, { draft });
    const { user } = await openDialog();

    expect(
      await within(screen.getByRole('dialog', { name: 'Reply to reviewers' })).findByText(
        "Claude couldn't draft replies. Write your own, or leave a thread as it is.",
      ),
    ).toBeVisible();
    const post = within(dialog()).getByRole('button', { name: 'Post replies' });
    expect(post).toBeDisabled();
    await user.click(within(thread('src/api.ts line 7')).getByRole('checkbox', { name: 'Resolve' }));
    expect(post).toBeEnabled();
    await user.click(post);
    await waitFor(() => {
      expect(sent).toEqual([{ threads: [{ id: 'PRRT_kwDOAbc2', reply: '', resolve: true }] }]);
    });
  });

  it('AC-5: keeps the threads GitHub refused, with its words, and a second press posts only those, a sent reply not again', async () => {
    const sent = serve(open, {
      post: {
        result: 'posted',
        failed: [
          { id: 'PRRT_kwDOAbc1', problem: { kind: 'github_said', message: 'Resolve is turned off.' }, replied: true },
        ],
      },
    });
    const { user } = await openDialog();
    const draft = await screen.findByRole('dialog', { name: 'Reply to reviewers' });
    await within(draft).findByRole('group', { name: 'src/ContentList.tsx line 42' });
    await user.type(within(thread('src/api.ts line 7')).getByRole('textbox', { name: 'Reply' }), 'Renamed it.');
    await user.click(within(dialog()).getByRole('button', { name: 'Post replies' }));

    const failed = await within(dialog()).findByRole('alert');
    expect(failed).toHaveTextContent('GitHub refused this: Resolve is turned off.');
    expect(within(dialog()).queryByRole('group', { name: 'src/api.ts line 7' })).toBeNull();
    const kept = thread('src/ContentList.tsx line 42');
    expect(within(kept).getByRole('textbox', { name: 'Reply' })).toHaveValue('');
    expect(within(kept).getByRole('checkbox', { name: 'Resolve' })).toBeChecked();

    await user.click(within(dialog()).getByRole('button', { name: 'Post replies' }));
    await waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent[1]).toEqual({ threads: [{ id: 'PRRT_kwDOAbc1', reply: '', resolve: true }] });
  });

  it('AC-6: when GitHub can’t be reached, says so, and Try again reads the threads again', async () => {
    serve(open, { draft: { result: 'failed', problem: { kind: 'github_unreachable' } } });
    const { user } = await openDialog();
    expect(
      await within(screen.getByRole('dialog', { name: 'Reply to reviewers' })).findByText(
        "Orynx couldn't read the review threads. Couldn't reach GitHub. Try again.",
      ),
    ).toBeVisible();
    serve(open);
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog()).findByRole('group', { name: 'src/ContentList.tsx line 42' })).toBeVisible();
  });

  it('AC-7: with no unresolved threads, says none are waiting, and Close closes', async () => {
    serve(open, { draft: makeReplyDraft({ threads: [], byClaude: false }) });
    const { user } = await openDialog();
    expect(
      await within(screen.getByRole('dialog', { name: 'Reply to reviewers' })).findByText(
        'No review threads are waiting on #2841.',
      ),
    ).toBeVisible();
    await user.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Reply to reviewers' })).toBeNull();
  });

  it('AC-8, AC-9: Escape closes it with nothing posted, and focus goes back to the button', async () => {
    const sent = serve(open);
    const { user } = await openDialog();
    await within(await screen.findByRole('dialog', { name: 'Reply to reviewers' })).findByRole('group', {
      name: 'src/ContentList.tsx line 42',
    });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Reply to reviewers' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reply to reviewers' })).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('says when the post never reached Orynx, and keeps every thread', async () => {
    serve(open, { post: 'fails' });
    const { user } = await openDialog();
    await within(await screen.findByRole('dialog', { name: 'Reply to reviewers' })).findByRole('group', {
      name: 'src/ContentList.tsx line 42',
    });
    await user.click(within(dialog()).getByRole('button', { name: 'Post replies' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent("Couldn't post the replies. Try again.");
    expect(thread('src/ContentList.tsx line 42')).toBeVisible();
  });
});
