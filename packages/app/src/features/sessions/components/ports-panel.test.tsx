import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type SessionPort } from '@devhub/contracts';
import { makeSession, makeSessionPort } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const runSession = makeSession({
  id,
  state: 'done',
  intent: 'run',
  branch: null,
  worktreePath: '/Users/you/.devhub/worktrees/x',
  terminal: true,
});
const web = makeSessionPort();
const database = makeSessionPort({
  port: 5432,
  pid: 812,
  program: 'postgres',
  name: 'PostgreSQL',
  url: null,
  startedBy: 'you',
  restartable: false,
  command: 'postgres -D ./data',
});
const found = makeSessionPort({
  port: 3006,
  pid: 900,
  startedBy: 'found',
  restartable: false,
  url: 'http://localhost:3006',
  command: 'python -m http.server 3006',
});

// Two minutes after the web server started listening.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-16T10:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The session, what listens from it, and every stop, restart and Terminal call it gets. */
function listening(ports: SessionPort[], session = runSession) {
  const calls: string[] = [];
  let now = ports;
  server.use(
    sessionHandler(session),
    http.get(apiUrl(apiRoutes.sessionPorts), () => HttpResponse.json({ ports: now })),
    http.post(apiUrl(apiRoutes.sessionPortStop), ({ params }) => {
      calls.push(`stop ${String(params['port'])}`);
      now = now.filter((port) => String(port.port) !== params['port']);
      return HttpResponse.json({ result: 'done' });
    }),
    http.post(apiUrl(apiRoutes.sessionPortRestart), ({ params }) => {
      calls.push(`restart ${String(params['port'])}`);
      return HttpResponse.json({ result: 'done' });
    }),
    http.post(apiUrl(apiRoutes.sessionTerminalTabs), () => {
      calls.push('new tab');
      return HttpResponse.json({ result: 'added', tabId: 'tab-2' });
    }),
    http.post(apiUrl(apiRoutes.sessionTerminalInput), async ({ request }) => {
      calls.push(`typed ${((await request.json()) as { data: string }).data}`);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

const tabs = () => within(screen.getByRole('tablist', { name: 'Session details' })).getAllByRole('tab');
/** The Ports tab's list, once it's there; the header links the same address. */
const portList = () => screen.findByRole('list', { name: 'Ports', busy: false });

describe('the Ports tab (spec 042)', () => {
  it('AC-1, AC-33: a run session opens on Ports, after Changes (spec 048), with how many listen', async () => {
    listening([web]);
    await renderApp({ route });
    await waitFor(() => {
      expect(tabs().map((tab) => tab.textContent)).toEqual(['Changes 0', 'Ports 1', 'Context 1']);
    });
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-33: any other session opens on Changes, with Ports after it (spec 048)', async () => {
    listening([web], makeSession({ ...runSession, intent: 'change' }));
    await renderApp({ route });
    await waitFor(() => {
      expect(tabs()[1]?.textContent).toBe('Ports 1');
    });
    expect(screen.getByRole('tab', { name: /Changes/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('AC-37: a session with no Terminal has no Ports tab', async () => {
    listening([], makeSession({ ...runSession, terminal: false }));
    await renderApp({ route });
    await screen.findByRole('tab', { name: /Changes/ });
    expect(screen.queryByRole('tab', { name: /Ports/ })).not.toBeInTheDocument();
  });

  it('AC-8: nothing listening says so, and the tab has no count', async () => {
    listening([]);
    await renderApp({ route });
    expect(
      await screen.findByText(
        'Nothing listens from this session. Servers Claude or you start here show up on their own.',
      ),
    ).toBeVisible();
    expect(tabs()[1]?.textContent).toBe('Ports');
  });

  it('AC-9: ports it couldn’t read say so, with Try again', async () => {
    let fails = true;
    server.use(
      sessionHandler(runSession),
      http.get(apiUrl(apiRoutes.sessionPorts), () =>
        fails
          ? HttpResponse.json({ code: 'ports_unreadable', message: "Couldn't read the ports." }, { status: 503 })
          : HttpResponse.json({ ports: [web] }),
      ),
    );
    const { user } = await renderApp({ route });
    expect(await screen.findByText("Couldn't read the ports.")).toBeVisible();
    fails = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await within(await portList()).findByText('localhost:3005')).toBeVisible();
  });

  it('AC-2, AC-11, AC-35: a web server Claude started: Open its address, Restart, Stop, each named for it', async () => {
    const calls = listening([web]);
    const { user, platform } = await renderApp({ route });
    const row = (await within(await portList()).findByText('localhost:3005')).closest('li') as HTMLElement;
    expect(within(row).getByText('Claude · 2 min')).toBeVisible();
    expect(
      within(row)
        .getAllByRole('link')
        .concat(within(row).getAllByRole('button'))
        .map((one) => one.getAttribute('aria-label') ?? one.textContent),
    ).toEqual(['Open localhost:3005', 'Restart localhost:3005', 'Stop localhost:3005']);
    await user.click(within(row).getByRole('link', { name: 'Open localhost:3005' }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://localhost:3005');
    await user.click(within(row).getByRole('button', { name: 'Restart localhost:3005' }));
    await user.click(within(row).getByRole('button', { name: 'Stop localhost:3005' }));
    await waitFor(() => {
      expect(calls).toEqual(['restart 3005', 'stop 3005']);
    });
    expect(
      await screen.findByText(
        'Nothing listens from this session. Servers Claude or you start here show up on their own.',
      ),
    ).toBeVisible();
  });

  it('AC-10: a database is named, and copies its address instead of opening it', async () => {
    listening([database]);
    const { user } = await renderApp({ route });
    const row = (await within(await portList()).findByText('localhost:5432')).closest('li') as HTMLElement;
    expect(within(row).getByText('PostgreSQL')).toBeVisible();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Copy localhost:5432' }));
    // user-event's own clipboard stands in for the browser's.
    expect(await navigator.clipboard.readText()).toBe('localhost:5432');
    expect(await within(row).findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('AC-6: one found in the worktree asks before Stop, has no Restart, and Run again in Terminal types its command', async () => {
    const calls = listening([found]);
    const { user } = await renderApp({ route });
    const row = (await within(await portList()).findByText('localhost:3006')).closest('li') as HTMLElement;
    expect(within(row).getByText('Found in the worktree · 2 min')).toBeVisible();
    expect(within(row).queryByRole('button', { name: /Restart/ })).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Run again in Terminal' }));
    await waitFor(() => {
      expect(calls).toEqual(['new tab', 'typed python -m http.server 3006']);
    });
    expect(await screen.findByText('Typed it in a new Terminal tab: open Terminal to run it.')).toBeVisible();

    await user.click(within(row).getByRole('button', { name: 'Stop localhost:3006' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Stop localhost:3006?' });
    expect(calls).not.toContain('stop 3006');
    await user.click(within(ask).getByRole('button', { name: 'Stop' }));
    await waitFor(() => {
      expect(calls).toContain('stop 3006');
    });
  });
});
