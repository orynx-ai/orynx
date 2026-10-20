import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeOrynxTicket } from '@devhub/contracts/testing';
import {
  agentsAccessQueryOptions,
  ApiRequestError,
  createApiClient,
  orynxTicketQueryOptions,
  queryKeys,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const url = (path: string) => `${baseURL}${path}`;
const ticketUrl = (key: string) => url(apiRoutes.orynxTicket.replace(':key', key));
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

describe('Orynx tickets (spec 037)', () => {
  it('AC-7: makes a ticket with the page token, and reads back what the server made', async () => {
    const made = makeOrynxTicket({ key: 'ORX-1' });
    let sent: unknown = null;
    let token: string | null = null;
    server.use(
      http.post(url(apiRoutes.orynxTickets), async ({ request }) => {
        sent = await request.json();
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(made);
      }),
    );

    expect(await api.createOrynxTicket({ title: 'Add bulk archive', status: 'in_progress' })).toEqual(made);
    expect(sent).toEqual({ title: 'Add bulk archive', status: 'in_progress' });
    expect(token).toBe('abc');
  });

  it('AC-13, AC-16, AC-18: reads, saves and deletes one, with the answers the server gives', async () => {
    const ticket = makeOrynxTicket();
    let change: unknown = null;
    server.use(
      http.get(ticketUrl('ORX-3'), () => HttpResponse.json({ result: 'found', ticket })),
      http.patch(ticketUrl('ORX-3'), async ({ request }) => {
        change = await request.json();
        return HttpResponse.json({ result: 'changed', ticket });
      }),
      http.delete(ticketUrl('ORX-3'), () => HttpResponse.json({ result: 'deleted' })),
    );

    expect(await api.orynxTicket('ORX-3')).toEqual({ result: 'found', ticket });
    expect(await api.updateOrynxTicket('ORX-3', { priority: 'High', version: 1 })).toEqual({
      result: 'changed',
      ticket,
    });
    expect(change).toEqual({ priority: 'High', version: 1 });
    expect(await api.deleteOrynxTicket('ORX-3')).toEqual({ result: 'deleted' });
  });

  it('AC-11: a failed save is an ApiRequestError, and an answer off the contract too', async () => {
    server.use(
      http.post(url(apiRoutes.orynxTickets), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
      http.get(ticketUrl('ORX-3'), () => HttpResponse.json({ result: 'found' })),
    );

    await expect(api.createOrynxTicket({ title: 'x' })).rejects.toBeInstanceOf(ApiRequestError);
    await expect(api.orynxTicket('ORX-3')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('keeps a ticket under its own key until tickets.changed says otherwise', () => {
    const options = orynxTicketQueryOptions(api, 'ORX-3');
    expect(options.queryKey).toEqual([...queryKeys.orynxTicket, 'ORX-3']);
    expect(options.staleTime).toBe(Infinity);
  });
});

describe('agents outside Orynx (spec 037)', () => {
  it('AC-39, AC-40: reads and turns the door, and copies the config the server wrote', async () => {
    let turned: unknown = null;
    server.use(
      http.get(url(apiRoutes.agentsAccess), () => HttpResponse.json({ enabled: false })),
      http.put(url(apiRoutes.agentsAccess), async ({ request }) => {
        turned = await request.json();
        return HttpResponse.json({ enabled: true });
      }),
      http.post(url(apiRoutes.agentsAccessConfig), () => HttpResponse.json({ config: '{"mcpServers":{}}' })),
    );

    expect(await api.agentsAccess()).toEqual({ enabled: false });
    expect(await api.setAgentsAccess({ enabled: true })).toEqual({ enabled: true });
    expect(turned).toEqual({ enabled: true });
    expect(await api.mcpConfig()).toEqual({ config: '{"mcpServers":{}}' });
    expect(agentsAccessQueryOptions(api).queryKey).toEqual(queryKeys.agentsAccess);
  });
});
