import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ClaudeCommandList, type Session } from '@devhub/contracts';
import { makeClaudeCommands, makeSession, makeSessionApproval } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../../../../test/fake-event-source.ts';
import { apiUrl, server, sessionHandler } from '../../../../test/msw.ts';
import { renderApp } from '../../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const session = makeSession({
  id,
  title: 'Add bulk archive',
  state: 'working',
  worktreePath: '/Users/you/.devhub/worktrees/0123456789abcdef',
  terminal: true,
});

/** The Session screen with its Terminal open on the Claude tab, Claude's commands as the server has them. */
async function openClaudeTab(found: Session, commands: () => ClaudeCommandList | Promise<ClaudeCommandList>) {
  server.use(
    sessionHandler(found),
    http.get(apiUrl(apiRoutes.sessionCommands), async () => HttpResponse.json(await commands())),
  );
  const rendered = await renderApp({ route });
  await rendered.user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'Terminal' }));
  await rendered.user.click(await screen.findByRole('tab', { name: /^Claude/ }));
  return rendered;
}

describe('the Terminal’s Claude tab', () => {
  it('AC-19: shows each command Claude ran, oldest first, marked Claude, with how it went and its output', async () => {
    await openClaudeTab(session, () => makeClaudeCommands());

    const log = await screen.findByRole('log', { name: "Claude's commands" });
    expect(await within(log).findByText('✓ 0.1s')).toBeVisible();
    expect(within(log).getByText('git status')).toBeVisible();
    expect(within(log).getByText('On branch feat/PROJ-1423')).toBeVisible();
    expect(within(log).getByText('✗ failed · 3.0s')).toBeVisible();
    expect(within(log).getByText('● running')).toBeVisible();
    expect(within(log).getAllByText('Claude')).toHaveLength(5);
    expect(within(log).getByText('Denied by you. Claude will continue without it.')).toBeVisible();
    expect(within(log).getByText("Couldn't push or open a pull request: Settings didn't allow it")).toBeVisible();
    expect(within(log).getByRole('button', { name: 'Copy git status and its output' })).toBeVisible();
    // Read-only: there's nothing to type in, only the line that says so.
    expect(screen.queryByRole('textbox', { name: 'Command' })).toBeNull();
    expect(screen.getByText(/Read-only\. This is what Claude ran\./)).toBeVisible();
    expect(screen.getByText('Sandbox')).toBeVisible();
    await expectNoAxeViolations(screen.getByRole('dialog', { name: 'Terminal' }));
  });

  it('AC-20: a command Claude runs next appears at the bottom without a reload', async () => {
    let list = makeClaudeCommands();
    await openClaudeTab(session, () => list);
    const log = await screen.findByRole('log', { name: "Claude's commands" });
    await within(log).findByText('npm run lint');

    list = { commands: [...list.commands, { id: 'toolu_6', state: 'running', command: 'pnpm build' }] };
    FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });

    expect(await within(log).findByText('pnpm build')).toBeVisible();
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('AC-21, AC-22: a command waiting for you has the callout’s choices, and answering it answers the session’s call', async () => {
    const asked: unknown[] = [];
    server.use(
      http.post(apiUrl(apiRoutes.sessionApproval), async ({ request, params }) => {
        asked.push({ approvalId: params['approvalId'], ...((await request.json()) as object) });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const waiting = makeSession({ ...session, state: 'needs_you', approvals: [makeSessionApproval()] });
    const { user } = await openClaudeTab(waiting, () => ({ commands: [] }));

    expect(await screen.findByRole('tab', { name: 'Claude Needs you' })).toHaveAttribute('aria-selected', 'true');
    const log = screen.getByRole('log', { name: "Claude's commands" });
    expect(within(log).getByText('npm test -- content-list')).toBeVisible();
    expect(within(log).getByText('● waiting for you')).toBeVisible();
    expect(within(log).getByRole('button', { name: 'Always allow npm test' })).toBeVisible();
    await expectNoAxeViolations(screen.getByRole('dialog', { name: 'Terminal' }));
    await user.click(within(log).getByRole('button', { name: 'Allow once' }));
    await waitFor(() => {
      expect(asked).toEqual([{ approvalId: 'approval-1', decision: 'allow_once' }]);
    });
  });

  it('AC-21: on your shell, the header says Claude needs you, and pressing it picks the Claude tab', async () => {
    const waiting = makeSession({ ...session, state: 'needs_you', approvals: [makeSessionApproval()] });
    server.use(sessionHandler(waiting));
    const { user } = await renderApp({ route });
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'Terminal' }));

    await user.click(await screen.findByRole('button', { name: 'Claude needs you' }));
    expect(screen.getByRole('tab', { name: 'Claude Needs you' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Claude needs you' })).toBeNull();
  });

  it('AC-23: a session saved before spec 036 shows its commands with no output', async () => {
    const older = makeSession({
      ...session,
      activities: [{ id: 'step-1', state: 'done', kind: 'command', commands: ['npm test', 'npm run lint'] }],
    });
    await openClaudeTab(older, () => ({ commands: [] }));

    const log = await screen.findByRole('log', { name: "Claude's commands" });
    expect(await within(log).findByText('npm run lint')).toBeVisible();
    expect(within(log).getAllByText("Output wasn't kept for this command.")).toHaveLength(2);
  });

  it('AC-24: says Nothing yet before Claude has run a command', async () => {
    await openClaudeTab(session, () => ({ commands: [] }));
    expect(await screen.findByText('Nothing yet.')).toBeVisible();
  });

  it('AC-27: holds the blocks’ place while they load', async () => {
    await openClaudeTab(session, async () => {
      await delay('infinite');
      return { commands: [] };
    });
    expect(await screen.findByRole('log', { name: "Claude's commands" })).toHaveAttribute('aria-busy', 'true');
  });

  it('says it couldn’t load the commands, and Try again reads them again', async () => {
    let fails = true;
    server.use(
      sessionHandler(session),
      http.get(apiUrl(apiRoutes.sessionCommands), () =>
        fails ? HttpResponse.error() : HttpResponse.json(makeClaudeCommands()),
      ),
    );
    const { user } = await renderApp({ route });
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'Terminal' }));
    await user.click(await screen.findByRole('tab', { name: 'Claude' }));

    expect(await screen.findByText("Couldn't load Claude's commands")).toBeVisible();
    fails = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('git status')).toBeVisible();
  });
});
