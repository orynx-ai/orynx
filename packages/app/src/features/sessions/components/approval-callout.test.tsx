import { act, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Session, type SessionApproval } from '@devhub/contracts';
import { makeSession, makeSessionApproval } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** The callout holds exactly these buttons, by the names a screen reader hears, in this order. */
function expectButtons(callout: HTMLElement, names: string[]) {
  expect(within(callout).getAllByRole('button')).toEqual(
    names.map((name) => within(callout).getByRole('button', { name })),
  );
}

const id = '0123456789abcdef';
const route = `/sessions/${id}`;

const npmTest = makeSessionApproval({ id: 'approval-1' });
const lint = makeSessionApproval({ id: 'approval-2', command: 'npm run lint', description: null, alwaysAllow: null });
const editing: SessionApproval = {
  id: 'approval-3',
  kind: 'edit',
  path: 'src/content/ContentList.tsx',
  creates: false,
  lines: [
    { kind: 'removed', number: 42, text: '  const [rows] = useState(items);' },
    { kind: 'added', number: 42, text: '  const { selected } = useSelection(items);' },
  ],
  moreLines: 12,
  askedAt: '2026-10-16T10:00:00.000Z',
};

function waitingOn(...approvals: SessionApproval[]): Session {
  return makeSession({ id, state: approvals.length === 0 ? 'working' : 'needs_you', approvals });
}

/** The session waits on these calls; each answer is recorded, and the server answers it as `reply` says. */
function setUp(
  approvals: SessionApproval[],
  reply: () => Response | Promise<Response> = () => new Response(null, { status: 204 }),
) {
  let shown = waitingOn(...approvals);
  const answers: { approvalId: string; decision: unknown }[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.session), () => HttpResponse.json(shown)),
    http.post(apiUrl(apiRoutes.sessionApproval), async ({ params, request }) => {
      answers.push({
        approvalId: String(params['approvalId']),
        decision: ((await request.json()) as { decision: unknown }).decision,
      });
      return reply();
    }),
  );
  /** The server took the answer: the session changes, and it says so on the event stream. */
  const answered = (...left: SessionApproval[]) => {
    shown = waitingOn(...left);
    act(() => {
      FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });
    });
  };
  return { answers, answered };
}

describe('ApprovalCallout (spec 012)', () => {
  it('AC-1, AC-18: says Claude wants to run the command, as written, with Allow once and Deny, and leaves focus where it was', async () => {
    setUp([lint]);
    await renderApp({ route });

    const callout = await screen.findByRole('alert');
    expect(within(callout).getByText('Claude wants to run a command')).toBeVisible();
    expect(within(callout).getByText('npm run lint').tagName).toBe('CODE');
    expectButtons(callout, ['Allow once', 'Deny']);
    expect(callout).not.toContainElement(document.activeElement as HTMLElement | null);
  });

  it('AC-5, Q1: offers Always allow with the entry it would save, when the server offers it', async () => {
    setUp([npmTest]);
    await renderApp({ route });
    const callout = await screen.findByRole('alert');
    expectButtons(callout, ['Allow once', 'Always allow npm test', 'Deny']);
  });

  it('AC-6, Q8b: says why a command always asks', async () => {
    setUp([makeSessionApproval({ command: 'curl https://x.test', alwaysAsk: 'network', alwaysAllow: null })]);
    await renderApp({ route });
    const callout = await screen.findByRole('alert');
    expect(
      within(callout).getByText(
        'This reaches the network, so it always asks. If you allow it, it runs once outside the sandbox.',
      ),
    ).toBeVisible();
  });

  it('AC-2, AC-18: Allow once sends the answer, and once nothing waits, focus moves to Claude’s progress', async () => {
    const { answers, answered } = setUp([npmTest]);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Allow once' }));

    await waitFor(() => {
      expect(answers).toEqual([{ approvalId: 'approval-1', decision: 'allow_once' }]);
    });
    answered();
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(screen.getByRole('region', { name: "Claude's progress" })).toHaveFocus();
  });

  it('AC-3, AC-5: Deny and Always allow send their own answers', async () => {
    const { answers } = setUp([npmTest]);
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Always allow npm test' }));
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    await waitFor(() => {
      expect(answers.map((answer) => answer.decision)).toEqual(['always_allow', 'deny']);
    });
  });

  it('AC-10, AC-18: with two calls waiting it shows the first, then the next, with focus on its first button', async () => {
    const { answered } = setUp([npmTest, lint]);
    const { user } = await renderApp({ route });
    expect(await screen.findByText('npm test -- content-list')).toBeVisible();
    expect(screen.queryByText('npm run lint')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Deny' }));
    answered(lint);

    expect(await screen.findByText('npm run lint')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Allow once' })).toHaveFocus();
  });

  it('AC-8, Q9: an edit shows its file and the change, and how many lines more', async () => {
    setUp([editing]);
    await renderApp({ route });
    const callout = await screen.findByRole('alert');
    expect(within(callout).getByText('Claude wants to edit a file')).toBeVisible();
    const change = within(callout).getByRole('region', { name: 'Changes in ContentList.tsx' });
    expect(within(change).getByText('src/content/ContentList.tsx')).toBeVisible();
    expect(within(change).getByText('const { selected } = useSelection(items);', { exact: false })).toBeVisible();
    expect(within(callout).getByText('and 12 more lines')).toBeVisible();
    expect(within(callout).queryByRole('button', { name: /Always allow/ })).toBeNull();
  });

  it('the pressed button shows it is busy and the others wait while the answer is on its way', async () => {
    setUp([npmTest], async () => {
      await delay('infinite');
      return new Response(null, { status: 204 });
    });
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Allow once' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Allow once' })).toHaveAttribute('aria-disabled', 'true');
    });
    expect(screen.getByRole('button', { name: 'Always allow npm test' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
  });

  it('AC-14, Q8e: an answer that can’t be sent says so, and the buttons work again', async () => {
    setUp([npmTest], () => HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 }));
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Allow once' }));
    expect(await screen.findByText("Couldn't send your answer. Try again.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
  });

  it('AC-14, Q8e: Always allow that couldn’t save the list says so, naming the entry', async () => {
    setUp([npmTest], () => HttpResponse.json({ code: 'settings_unsaved', message: 'x' }, { status: 503 }));
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Always allow npm test' }));
    expect(
      await screen.findByText("Couldn't save npm test to your allow list. Try again, or allow it once."),
    ).toBeVisible();
  });

  it('AC-13: an answer that came too late, because another tab answered first, shows no error', async () => {
    const { answers } = setUp([npmTest], () =>
      HttpResponse.json({ code: 'already_answered', message: 'x' }, { status: 409 }),
    );
    const { user } = await renderApp({ route });
    await user.click(await screen.findByRole('button', { name: 'Deny' }));
    await waitFor(() => {
      expect(answers).toHaveLength(1);
    });
    expect(screen.queryByText(/Couldn't/)).toBeNull();
  });

  it('shows nothing when no call waits', async () => {
    server.use(sessionHandler(waitingOn()));
    await renderApp({ route });
    expect(await screen.findByRole('region', { name: "Claude's progress" })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
