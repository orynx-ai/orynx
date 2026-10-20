import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeClaudeCommands, makeTerminal } from '@devhub/contracts/testing';
import { QueryClient } from '@tanstack/react-query';
import {
  ApiRequestError,
  createApiClient,
  sessionCommandsQueryKey,
  sessionCommandsQueryOptions,
  sessionQueryKey,
  sessionTerminalQueryKey,
  sessionTerminalQueryOptions,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const id = '0123456789abcdef';
const url = (route: string, tabId = 'tab-2', blockId = 'block-3') =>
  `${baseURL}${route.replace(':id', id).replace(':tabId', tabId).replace(':blockId', blockId)}`;
const server = setupServer();
const api = createApiClient({ baseURL, token: 'page-token' });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('the Terminal’s calls (spec 036)', () => {
  it('AC-19: reads the commands Claude ran, with the token', async () => {
    let token: string | null = null;
    server.use(
      http.get(url(apiRoutes.sessionCommands), ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeClaudeCommands());
      }),
    );
    expect(await api.sessionCommands(id)).toEqual(makeClaudeCommands());
    expect(token).toBe('page-token');
  });

  it('AC-4: reads your shell tabs, and runs a command in one', async () => {
    let sent: unknown = null;
    server.use(
      http.get(url(apiRoutes.sessionTerminal), () => HttpResponse.json(makeTerminal())),
      http.post(url(apiRoutes.sessionTerminalRun), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ result: 'started', blockId: 'block-4' });
      }),
    );
    expect(await api.terminal(id)).toEqual(makeTerminal());
    expect(await api.runCommand(id, 'tab-2', 'git status')).toEqual({ result: 'started', blockId: 'block-4' });
    expect(sent).toEqual({ command: 'git status' });
  });

  it('AC-9, AC-10, AC-11, AC-15: adds, closes and clears a tab, and stops its command', async () => {
    const asked: string[] = [];
    const heard =
      (method: string) =>
      ({ request }: { request: Request }) => {
        asked.push(`${method} ${new URL(request.url).pathname}`);
        return new HttpResponse(null, { status: 204 });
      };
    server.use(
      http.post(url(apiRoutes.sessionTerminalTabs), () => HttpResponse.json({ result: 'added', tabId: 'tab-2' })),
      http.delete(url(apiRoutes.sessionTerminalTab), heard('DELETE')),
      http.post(url(apiRoutes.sessionTerminalStop), heard('POST')),
      http.delete(url(apiRoutes.sessionTerminalBlocks), heard('DELETE')),
    );
    expect(await api.addTerminalTab(id)).toEqual({ result: 'added', tabId: 'tab-2' });
    await api.stopCommand(id, 'tab-2');
    await api.clearTerminalTab(id, 'tab-2');
    await api.closeTerminalTab(id, 'tab-2');
    expect(asked).toEqual([
      `POST /api/sessions/${id}/terminal/tabs/tab-2/stop`,
      `DELETE /api/sessions/${id}/terminal/tabs/tab-2/blocks`,
      `DELETE /api/sessions/${id}/terminal/tabs/tab-2`,
    ]);
  });

  it('AC-17: asks Claude to fix a failed block, and says why it can’t', async () => {
    server.use(
      http.post(url(apiRoutes.sessionTerminalFix), () =>
        HttpResponse.json({ result: 'cannot_send', reason: 'newer_session' }),
      ),
    );
    expect(await api.askToFix(id, 'tab-2', 'block-3')).toEqual({ result: 'cannot_send', reason: 'newer_session' });
  });

  it('AC-26: rejects with the server’s error, or a network one when it can’t be reached', async () => {
    server.use(
      http.post(url(apiRoutes.sessionTerminalRun), () =>
        HttpResponse.json({ code: 'not_found', message: 'This session has no Terminal.' }, { status: 404 }),
      ),
      http.get(url(apiRoutes.sessionTerminal), () => HttpResponse.error()),
    );
    await expect(api.runCommand(id, 'tab-2', 'ls')).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(api.terminal(id)).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('keys Claude’s commands under the session, so session.changed reads them again, and the tabs by session', async () => {
    expect(sessionCommandsQueryKey(id).slice(0, sessionQueryKey(id).length)).toEqual([...sessionQueryKey(id)]);
    server.use(
      http.get(url(apiRoutes.sessionCommands), () => HttpResponse.json(makeClaudeCommands())),
      http.get(url(apiRoutes.sessionTerminal), () => HttpResponse.json(makeTerminal())),
    );
    const client = new QueryClient();
    expect(await client.query(sessionCommandsQueryOptions(api, id))).toEqual(makeClaudeCommands());
    expect(await client.query(sessionTerminalQueryOptions(api, id))).toEqual(makeTerminal());
    expect(client.getQueryData(sessionTerminalQueryKey(id))).toEqual(makeTerminal());
  });
});
