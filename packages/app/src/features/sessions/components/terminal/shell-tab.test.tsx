import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Terminal } from '@devhub/contracts';
import { makeSession, makeTerminal } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../../../../test/fake-event-source.ts';
import { apiUrl, server, sessionHandler } from '../../../../test/msw.ts';
import { renderApp } from '../../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const session = makeSession({
  id,
  title: 'Add bulk archive',
  state: 'done',
  branch: 'feat/PROJ-1423',
  worktreePath: '/Users/you/.devhub/worktrees/0123456789abcdef',
  terminal: true,
});
const output = (tabId = 'tab-1') => `/api/sessions/${id}/terminal/tabs/${tabId}/output`;

/**
 * Your shell as the server keeps it. Every request the page sends is kept, in order: what you typed as
 * "keys tab-1 ls", and the sizes, adds and closes.
 */
function fakeShell(terminal: Terminal = makeTerminal()) {
  const state = { terminal, asked: [] as string[], reachable: true };
  const tabOf = (url: string) => new URL(url).pathname.split('/')[6] ?? '';
  server.use(
    sessionHandler(session),
    http.get(apiUrl(apiRoutes.sessionTerminal), () => HttpResponse.json(state.terminal)),
    http.post(apiUrl(apiRoutes.sessionTerminalInput), async ({ request }) => {
      if (!state.reachable) return HttpResponse.error();
      state.asked.push(`keys ${tabOf(request.url)} ${((await request.json()) as { data: string }).data}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl(apiRoutes.sessionTerminalSize), async ({ request }) => {
      const { cols, rows } = (await request.json()) as { cols: number; rows: number };
      state.asked.push(`size ${tabOf(request.url)} ${String(cols)}x${String(rows)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl(apiRoutes.sessionTerminalTabs), () => {
      state.asked.push('add');
      const number = state.terminal.tabs.length + 1;
      if (number > 5) return HttpResponse.json({ result: 'full' });
      const added = { id: `tab-${String(number)}`, number };
      state.terminal = { ...state.terminal, tabs: [...state.terminal.tabs, added] };
      return HttpResponse.json({ result: 'added', tabId: added.id });
    }),
    http.delete(apiUrl(apiRoutes.sessionTerminalTab), ({ request }) => {
      const closed = tabOf(request.url);
      state.asked.push(`close ${closed}`);
      state.terminal = { ...state.terminal, tabs: state.terminal.tabs.filter((one) => one.id !== closed) };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

/** What you typed, as the server got it, request by request joined up. */
function typed(asked: string[], tabId = 'tab-1') {
  return asked
    .filter((line) => line.startsWith(`keys ${tabId} `))
    .map((line) => line.slice(`keys ${tabId} `.length))
    .join('');
}

async function openShell() {
  const rendered = await renderApp({ route });
  await rendered.user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'More actions' }));
  await rendered.user.click(await screen.findByRole('menuitem', { name: 'Terminal' }));
  const shell = await screen.findByRole('textbox', { name: 'zsh · worktree' });
  return { ...rendered, shell };
}

/** A row of the terminal, matched whole: colours split it into pieces. */
function row(text: string) {
  return (_: string, element: Element | null) =>
    element?.tagName === 'DIV' && element.textContent.replaceAll(' ', ' ').trimEnd() === text;
}

describe('the Terminal’s shell tab (spec 038)', () => {
  it('AC-1: is a real terminal on your shell in the worktree, drawing what the shell prints, colours and all', async () => {
    const asked = fakeShell().asked;
    const { shell } = await openShell();
    expect(shell).toHaveFocus();
    expect(screen.getByText('Your shell · runs as you')).toBeVisible();
    expect(screen.getByText('~/.devhub/worktrees/0123456789abcdef')).toBeVisible();

    const stream = FakeEventSource.at(output());
    expect(new URL(stream.url).searchParams.get('token')).toBe('test-token');
    stream.emit({ kind: 'replay', data: '\u001b[32m~/web-app\u001b[0m ❯ ' });
    stream.emit({ kind: 'data', data: 'git status\r\nOn branch feat/PROJ-1423\r\n' });
    expect(await screen.findAllByText(row('On branch feat/PROJ-1423'))).not.toHaveLength(0);
    expect(screen.getAllByText(row('~/web-app ❯ git status'))).not.toHaveLength(0);
    await waitFor(() => {
      expect(asked).toContain('size tab-1 80x24');
    });
    await expectNoAxeViolations(screen.getByRole('dialog', { name: 'Terminal' }));
  });

  it('AC-2: what you type goes to the shell in order, Enter and ⌃C included', async () => {
    const state = fakeShell();
    const { user } = await openShell();
    await user.keyboard('read answer{Enter}yes{Enter}');
    await waitFor(() => {
      expect(typed(state.asked)).toBe('read answer\ryes\r');
    });
  });

  it('AC-2: Esc in your shell is the shell’s, so the Terminal stays open', async () => {
    fakeShell();
    const { user, shell } = await openShell();
    await user.keyboard('{Escape}');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('dialog', { name: 'Terminal' })).toBeVisible();
    expect(shell).toHaveFocus();
  });

  it('AC-5: a replay draws the screen from scratch, as after a reconnect', async () => {
    fakeShell();
    await openShell();
    const stream = FakeEventSource.at(output());
    stream.emit({ kind: 'replay', data: 'before' });
    expect(await screen.findAllByText(row('before'))).not.toHaveLength(0);
    stream.emit({ kind: 'replay', data: 'after' });
    expect(await screen.findAllByText(row('after'))).not.toHaveLength(0);
    expect(screen.queryAllByText(row('before'))).toHaveLength(0);
  });

  it('AC-6: + opens a new shell, picked and ready to type in; closing it picks the tab before it', async () => {
    const state = fakeShell();
    const { user } = await openShell();
    await user.click(screen.getByRole('button', { name: 'New terminal in this session' }));
    const second = await screen.findByRole('textbox', { name: 'zsh 2' });
    expect(screen.getByRole('tab', { name: 'zsh 2' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      expect(second).toHaveFocus();
    });
    expect(FakeEventSource.at(output('tab-2')).closed).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Close zsh 2' }));
    expect(await screen.findByRole('textbox', { name: 'zsh · worktree' })).toHaveFocus();
    expect(state.asked).toContain('close tab-2');
    expect(screen.queryByRole('tab', { name: 'zsh 2' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close zsh · worktree' })).toBeNull();
  });

  it('AC-6: with 5 tabs, + says why it does nothing', async () => {
    const tabs = [1, 2, 3, 4, 5].map((number) => ({ id: `tab-${String(number)}`, number }));
    const state = fakeShell(makeTerminal({ tabs }));
    const { user } = await openShell();
    const add = screen.getByRole('button', { name: '5 terminals is the most for a session.' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    await user.click(add);
    expect(state.asked).not.toContain('add');
  });

  it('AC-7: a tab whose shell ended goes, and the first one shows', async () => {
    const tabs = [
      { id: 'tab-1', number: 1 },
      { id: 'tab-2', number: 2 },
    ];
    const state = fakeShell(makeTerminal({ tabs }));
    const { user } = await openShell();
    await user.click(screen.getByRole('tab', { name: 'zsh 2' }));
    const stream = FakeEventSource.at(output('tab-2'));

    state.terminal = makeTerminal();
    FakeEventSource.latest().emit({ type: 'session.terminal.changed', sessionId: id });
    expect(await screen.findByRole('textbox', { name: 'zsh · worktree' })).toBeVisible();
    expect(stream.closed).toBe(true);
  });

  it('when Orynx can’t be reached, what you typed waits, and Try again sends it', async () => {
    const state = fakeShell();
    const { user } = await openShell();
    state.reachable = false;
    await user.keyboard('ls');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Orynx.");

    state.reachable = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(typed(state.asked)).toBe('ls');
    });
    expect(screen.queryByText("Couldn't reach Orynx.")).toBeNull();
  });

  it('holds the terminal’s place while the tabs load', async () => {
    server.use(
      sessionHandler(session),
      http.get(apiUrl(apiRoutes.sessionTerminal), async () => {
        await delay('infinite');
        return HttpResponse.json(makeTerminal());
      }),
    );
    const { user } = await renderApp({ route });
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Terminal' }));
    expect(await screen.findByRole('log', { name: 'Terminal output' })).toHaveAttribute('aria-busy', 'true');
  });

  it('says it couldn’t reach Orynx when the tabs don’t load, and Try again reads them again', async () => {
    let fails = true;
    server.use(
      sessionHandler(session),
      http.get(apiUrl(apiRoutes.sessionTerminal), () =>
        fails ? HttpResponse.error() : HttpResponse.json(makeTerminal()),
      ),
    );
    const { user } = await renderApp({ route });
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Terminal' }));

    expect(await screen.findByText("Couldn't reach Orynx.")).toBeVisible();
    fails = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('textbox', { name: 'zsh · worktree' })).toBeVisible();
  });
});
