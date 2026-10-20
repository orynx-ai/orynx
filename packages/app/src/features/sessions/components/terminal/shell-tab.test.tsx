import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Terminal, type TerminalBlock, type TerminalTab } from '@devhub/contracts';
import { makeSession, makeTerminal, makeTerminalBlock } from '@devhub/contracts/testing';
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

const tab = (blocks: TerminalBlock[], more: Partial<TerminalTab> = {}): TerminalTab => ({
  id: 'tab-1',
  number: 1,
  blocks,
  cleared: false,
  ...more,
});

/**
 * Your shell as the server keeps it: the test changes `state.terminal` and says so with the event, as the server
 * does. Every request the page sends is kept, in order.
 */
function fakeShell(terminal: Terminal = makeTerminal({ tabs: [tab([])], history: [] })) {
  const state = { terminal, asked: [] as string[] };
  const path = (url: string) => new URL(url).pathname.replace(`/api/sessions/${id}/terminal`, '');
  server.use(
    sessionHandler(session),
    http.get(apiUrl(apiRoutes.sessionTerminal), () => HttpResponse.json(state.terminal)),
    http.post(apiUrl(apiRoutes.sessionTerminalRun), async ({ request }) => {
      state.asked.push(`run ${path(request.url)} ${((await request.json()) as { command: string }).command}`);
      return HttpResponse.json({ result: 'started', blockId: 'block-9' });
    }),
    http.post(apiUrl(apiRoutes.sessionTerminalStop), ({ request }) => {
      state.asked.push(`stop ${path(request.url)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(apiUrl(apiRoutes.sessionTerminalBlocks), ({ request }) => {
      state.asked.push(`clear ${path(request.url)}`);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl(apiRoutes.sessionTerminalTabs), () => {
      state.asked.push('add');
      const number = state.terminal.tabs.length + 1;
      if (number > 5) return HttpResponse.json({ result: 'full' });
      const added = tab([], { id: `tab-${String(number)}`, number });
      state.terminal = { ...state.terminal, tabs: [...state.terminal.tabs, added] };
      return HttpResponse.json({ result: 'added', tabId: added.id });
    }),
    http.delete(apiUrl(apiRoutes.sessionTerminalTab), ({ request }) => {
      state.asked.push(`close ${path(request.url)}`);
      const closed = path(request.url).replace('/tabs/', '');
      state.terminal = { ...state.terminal, tabs: state.terminal.tabs.filter((one) => one.id !== closed) };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return {
    state,
    /** The server's shell changed: the page hears it, as from the event stream. */
    change(next: Partial<Terminal>) {
      state.terminal = { ...state.terminal, ...next };
      FakeEventSource.latest().emit({ type: 'session.terminal.changed', sessionId: id });
    },
  };
}

async function openShell() {
  const rendered = await renderApp({ route });
  await rendered.user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'Terminal' }));
  const field = await screen.findByRole('textbox', { name: 'Command' });
  return { ...rendered, field, log: screen.getByRole('log', { name: 'Terminal output' }) };
}

describe('the Terminal’s shell tab', () => {
  it('AC-1, AC-4: runs what you type in the worktree and shows its output, the field emptied and still yours', async () => {
    const shell = fakeShell();
    const { user, field, log } = await openShell();
    expect(field).toHaveFocus();
    expect(screen.getByText('Your shell · runs as you')).toBeVisible();
    expect(screen.getByText('~/.devhub/worktrees/0123456789abcdef')).toBeVisible();
    expect(within(log).getByText("Runs in this session's worktree, as you. Type a command below.")).toBeVisible();

    await user.type(field, 'git status{Enter}');
    await waitFor(() => {
      expect(shell.state.asked).toEqual(['run /tabs/tab-1/commands git status']);
    });
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();

    shell.change({ tabs: [tab([makeTerminalBlock()])], history: ['git status'] });
    expect(await within(log).findByText(/nothing to commit, working tree clean/)).toBeVisible();
    expect(within(log).getByText('✓ 0.1s')).toBeVisible();
    await expectNoAxeViolations(screen.getByRole('dialog', { name: 'Terminal' }));
  });

  it('AC-5, AC-13, AC-14: a failed command says its exit code, and Rerun and Copy act on it', async () => {
    const failed = makeTerminalBlock({
      state: 'failed',
      command: 'pnpm test',
      exitCode: 1,
      ms: 3100,
      output: ['1 failed'],
    });
    const shell = fakeShell(makeTerminal({ tabs: [tab([failed])], history: ['pnpm test'] }));
    const { user, log } = await openShell();

    expect(within(log).getByText('✗ exit 1 · 3.1s')).toBeVisible();
    await user.click(within(log).getByRole('button', { name: 'Rerun pnpm test' }));
    await waitFor(() => {
      expect(shell.state.asked).toEqual(['run /tabs/tab-1/commands pnpm test']);
    });
    await user.click(within(log).getByRole('button', { name: 'Copy pnpm test and its output' }));
    expect(await navigator.clipboard.readText()).toBe('pnpm test\n1 failed');
    expect(within(log).getByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('AC-8, AC-9: a running command shows Stop, the field says the tab is busy, and Stop or ⌃C ends it', async () => {
    const running: TerminalBlock = {
      id: 'block-1',
      state: 'running',
      command: 'pnpm dev',
      output: ['VITE ready'],
      cut: false,
    };
    const shell = fakeShell(makeTerminal({ tabs: [tab([running])], history: ['pnpm dev'] }));
    const { user, field, log } = await openShell();

    expect(within(log).getByText('● running')).toBeVisible();
    expect(field).toHaveAttribute('placeholder', 'pnpm dev is running. ⌃C stops it, or + opens another terminal.');
    await user.click(within(log).getByRole('button', { name: 'Stop pnpm dev' }));
    await user.click(field);
    await user.keyboard('{Control>}c{/Control}');
    await waitFor(() => {
      expect(shell.state.asked).toEqual(['stop /tabs/tab-1/stop', 'stop /tabs/tab-1/stop']);
    });
  });

  it('AC-10, AC-11: + opens a new tab, picked and ready to type in; closing it picks the tab before it', async () => {
    const shell = fakeShell();
    const { user } = await openShell();

    await user.click(screen.getByRole('button', { name: 'New terminal in this session' }));
    const added = await screen.findByRole('tab', { name: 'zsh 2' });
    await waitFor(() => {
      expect(added).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByRole('textbox', { name: 'Command' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Close zsh 2' }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'zsh · worktree' })).toHaveAttribute('aria-selected', 'true');
    });
    expect(shell.state.asked).toEqual(['add', 'close /tabs/tab-2']);
    // The first tab is the worktree's own: it has no Close.
    expect(screen.queryByRole('button', { name: /^Close/ })).toBeNull();
  });

  it('AC-10: with 5 tabs, + says why it does nothing', async () => {
    const five = [1, 2, 3, 4, 5].map((number) => tab([], { id: `tab-${String(number)}`, number }));
    const shell = fakeShell(makeTerminal({ tabs: five, history: [] }));
    const { user } = await openShell();

    const add = screen.getByRole('button', { name: '5 terminals is the most for a session.' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    await user.click(add);
    expect(shell.state.asked).toEqual([]);
  });

  it('AC-12: ↑ and ↓ walk the commands you ran in this session', async () => {
    fakeShell(makeTerminal({ tabs: [tab([])], history: ['git status', 'pnpm test'] }));
    const { user, field } = await openShell();
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}');
    expect(field).toHaveValue('pnpm test');
  });

  it('AC-15: Clear output, or typing clear, empties the tab, which says so', async () => {
    const shell = fakeShell(makeTerminal({ tabs: [tab([makeTerminalBlock()])], history: ['git status'] }));
    const { user, field, log } = await openShell();

    await user.click(screen.getByRole('button', { name: 'Clear output' }));
    await user.type(field, 'clear{Enter}');
    await waitFor(() => {
      expect(shell.state.asked).toEqual(['clear /tabs/tab-1/blocks', 'clear /tabs/tab-1/blocks']);
    });
    shell.change({ tabs: [tab([], { cleared: true })] });
    expect(await within(log).findByText('Output cleared. Type a command below.')).toBeVisible();
  });

  it('AC-16, AC-25: says when only the last lines are kept, and when the worktree wasn’t there to run in', async () => {
    const blocks: TerminalBlock[] = [
      makeTerminalBlock({ cut: true }),
      { id: 'block-2', state: 'no_worktree', command: 'touch here' },
    ];
    fakeShell(makeTerminal({ tabs: [tab(blocks)], history: [] }));
    const { log } = await openShell();
    expect(within(log).getByText('Showing the last 2,000 lines.')).toBeVisible();
    expect(within(log).getByText("Couldn't run this. The worktree isn't there any more.")).toBeVisible();
  });

  it('AC-26: when Orynx can’t be reached, your command stays, and Try again sends it', async () => {
    const shell = fakeShell();
    let reachable = false;
    server.use(
      http.post(apiUrl(apiRoutes.sessionTerminalRun), () => {
        shell.state.asked.push('run');
        return reachable ? HttpResponse.json({ result: 'started', blockId: 'block-1' }) : HttpResponse.error();
      }),
    );
    const { user, field } = await openShell();

    await user.type(field, 'pnpm test{Enter}');
    expect(await screen.findByText("Couldn't reach Orynx.")).toBeVisible();
    expect(field).toHaveValue('pnpm test');
    reachable = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(field).toHaveValue('');
    });
    expect(shell.state.asked).toEqual(['run', 'run']);
    expect(screen.queryByText("Couldn't reach Orynx.")).toBeNull();
  });

  it('AC-27: holds the blocks’ place while the tabs load, and says when they couldn’t', async () => {
    server.use(
      sessionHandler(session),
      http.get(apiUrl(apiRoutes.sessionTerminal), async () => {
        await delay('infinite');
        return HttpResponse.json(makeTerminal());
      }),
    );
    const { user } = await renderApp({ route });
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'Terminal' }));
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
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'Terminal' }));

    expect(await screen.findByText("Couldn't reach Orynx.")).toBeVisible();
    fails = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('textbox', { name: 'Command' })).toBeVisible();
  });
});
