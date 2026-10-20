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
const url = (route: string, tabId = 'tab-2') => `${baseURL}${route.replace(':id', id).replace(':tabId', tabId)}`;
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

  it('AC-1, AC-2, AC-4 (038): reads your shell tabs, types into one and sets its size', async () => {
    const sent: unknown[] = [];
    const heard = async ({ request }: { request: Request }) => {
      sent.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    };
    server.use(
      http.get(url(apiRoutes.sessionTerminal), () => HttpResponse.json(makeTerminal())),
      http.post(url(apiRoutes.sessionTerminalInput), heard),
      http.post(url(apiRoutes.sessionTerminalSize), heard),
    );
    expect(await api.terminal(id)).toEqual(makeTerminal());
    await api.terminalInput(id, 'tab-2', 'git status\r');
    await api.resizeTerminal(id, 'tab-2', { cols: 120, rows: 40 });
    expect(sent).toEqual([{ data: 'git status\r' }, { cols: 120, rows: 40 }]);
  });

  it('AC-6 (038): adds and closes a tab', async () => {
    const asked: string[] = [];
    server.use(
      http.post(url(apiRoutes.sessionTerminalTabs), () => HttpResponse.json({ result: 'added', tabId: 'tab-2' })),
      http.delete(url(apiRoutes.sessionTerminalTab), ({ request }) => {
        asked.push(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    expect(await api.addTerminalTab(id)).toEqual({ result: 'added', tabId: 'tab-2' });
    await api.closeTerminalTab(id, 'tab-2');
    expect(asked).toEqual([`/api/sessions/${id}/terminal/tabs/tab-2`]);
  });

  it('rejects with the server’s error, or a network one when it can’t be reached', async () => {
    server.use(
      http.post(url(apiRoutes.sessionTerminalInput), () =>
        HttpResponse.json({ code: 'not_found', message: 'This session has no Terminal.' }, { status: 404 }),
      ),
      http.get(url(apiRoutes.sessionTerminal), () => HttpResponse.error()),
    );
    await expect(api.terminalInput(id, 'tab-2', 'ls')).rejects.toMatchObject({ code: 'not_found', status: 404 });
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
