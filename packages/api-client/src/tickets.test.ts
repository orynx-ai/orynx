import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeOpenSprint, makeTicket, makeTicketDetail, makeTickets } from '@devhub/contracts/testing';
import {
  ApiRequestError,
  createApiClient,
  queryKeys,
  ticketQueryOptions,
  ticketsQueryOptions,
  ticketsSprintsQueryOptions,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const url = (path: string) => `${baseURL}${path}`;
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('tickets endpoint', () => {
  it('AC-1: reads the sprint and its tickets with the page token', async () => {
    const tickets = makeTickets({ tickets: [makeTicket()] });
    let token: string | null = null;
    server.use(
      http.get(url(apiRoutes.tickets), ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(tickets);
      }),
    );

    expect(await api.tickets()).toEqual(tickets);
    expect(token).toBe('abc');
  });

  it('refuses an answer that is not the contract', async () => {
    server.use(http.get(url(apiRoutes.tickets), () => HttpResponse.json({ tickets: [{ key: 'PROJ-1' }] })));

    await expect(api.tickets()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-25: a server that stops answering is an ApiRequestError', async () => {
    server.use(http.get(url(apiRoutes.tickets), () => HttpResponse.error()));

    await expect(api.tickets()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('keeps the tickets until the event stream says a sync ended', () => {
    const options = ticketsQueryOptions(api);

    expect(options.queryKey).toEqual(queryKeys.tickets);
    expect(options.staleTime).toBe(Infinity);
  });
});

describe('a project’s sprints and the choice (spec 020)', () => {
  it('AC-26: asks for a project’s open sprints, keyed apart from the tickets', async () => {
    let project: string | null = null;
    server.use(
      http.get(url(apiRoutes.ticketsSprints), ({ request }) => {
        project = new URL(request.url).searchParams.get('project');
        return HttpResponse.json({ sprints: [makeOpenSprint()] });
      }),
    );

    expect(await api.ticketsSprints('WEB')).toEqual({ sprints: [makeOpenSprint()] });
    expect(project).toBe('WEB');
    expect(ticketsSprintsQueryOptions(api, 'WEB').queryKey).toEqual(['jira', 'sprints', 'WEB']);
    expect(ticketsSprintsQueryOptions(api, 'WEB').queryKey[0]).not.toBe(queryKeys.tickets[0]);
  });

  it('AC-26, AC-29: saves the choice', async () => {
    let body: unknown;
    server.use(
      http.put(url(apiRoutes.ticketsChoice), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.chooseTicketsSprint({ projectKey: 'WEB', sprintId: 43 });

    expect(body).toEqual({ projectKey: 'WEB', sprintId: 43 });
  });

  it('AC-28: rejects with the server’s reason when the sprints don’t load', async () => {
    server.use(
      http.get(url(apiRoutes.ticketsSprints), () =>
        HttpResponse.json({ code: 'integration_unreachable', message: 'Jira didn’t answer.' }, { status: 502 }),
      ),
    );

    await expect(api.ticketsSprints('WEB')).rejects.toMatchObject({ code: 'integration_unreachable' });
  });
});

describe('one ticket in full (spec 022)', () => {
  it('AC-40: reads the ticket by its key, under a key of its own that a sync never refreshes', async () => {
    const ticket = makeTicketDetail();
    let path = '';
    server.use(
      http.get(url(apiRoutes.ticket), ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ result: 'found', ticket });
      }),
    );

    expect(await api.ticket('PROJ-1423')).toEqual({ result: 'found', ticket });
    expect(path).toBe('/api/tickets/PROJ-1423');
    const options = ticketQueryOptions(api, 'PROJ-1423');
    expect(options.queryKey).toEqual([...queryKeys.ticket, 'PROJ-1423']);
    expect(options.queryKey.slice(0, queryKeys.tickets.length)).not.toEqual(queryKeys.tickets);
  });

  it('AC-44: passes on why there is no ticket, and refuses an answer of the wrong shape', async () => {
    server.use(http.get(url(apiRoutes.ticket), () => HttpResponse.json({ result: 'not_found' })));
    expect(await api.ticket('PROJ-9999')).toEqual({ result: 'not_found' });

    server.use(http.get(url(apiRoutes.ticket), () => HttpResponse.json({ result: 'found', ticket: { key: 'x' } })));
    await expect(api.ticket('PROJ-1423')).rejects.toBeInstanceOf(ApiRequestError);
  });
});
