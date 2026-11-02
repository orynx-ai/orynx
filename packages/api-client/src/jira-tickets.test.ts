import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeJiraTicketTypes, makeNewJiraTicket } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, jiraTicketTypesQueryOptions, queryKeys } from './index.ts';

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

describe('a new Jira ticket (spec 019)', () => {
  it('AC-2: reads a project’s types with the page token', async () => {
    const types = makeJiraTicketTypes();
    const asked: { project: string | null; token: string | null }[] = [];
    server.use(
      http.get(url(apiRoutes.jiraTicketTypes), ({ request }) => {
        asked.push({
          project: new URL(request.url).searchParams.get('project'),
          token: request.headers.get(tokenHeader),
        });
        return HttpResponse.json(types);
      }),
    );

    expect(await api.jiraTicketTypes('MAI')).toEqual(types);
    expect(asked).toEqual([{ project: 'MAI', token: 'abc' }]);
  });

  it('AC-8: a server that can’t read them, or an answer that isn’t the contract, is an ApiRequestError', async () => {
    server.use(
      http.get(url(apiRoutes.jiraTicketTypes), () =>
        HttpResponse.json({ code: 'integration_unreachable', message: 'No.' }, { status: 502 }),
      ),
    );
    await expect(api.jiraTicketTypes('MAI')).rejects.toBeInstanceOf(ApiRequestError);

    server.use(http.get(url(apiRoutes.jiraTicketTypes), () => HttpResponse.json({ types: [{ id: '1' }] })));
    await expect(api.jiraTicketTypes('MAI')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-2: asks each time the dialog opens, keeps nothing after it closes, and doesn’t ask again by itself', () => {
    const options = jiraTicketTypesQueryOptions(api, 'MAI');

    expect(options.queryKey).toEqual([...queryKeys.jiraTicketTypes, 'MAI']);
    // Not under `tickets`, so a sync's inbox.changed never asks Jira for them again.
    expect(options.queryKey[0]).not.toBe(queryKeys.tickets[0]);
    expect(options).toMatchObject({ staleTime: 0, gcTime: 0, retry: false });
  });

  it('AC-3, AC-10: sends the ticket and reads what came of it', async () => {
    const ticket = makeNewJiraTicket();
    const answer = {
      result: 'made_but',
      key: 'MAI-142',
      url: 'https://your-team.atlassian.net/browse/MAI-142',
      missed: 'sprint',
      reason: 'Sprint 14 is closed.',
    };
    let sent: unknown;
    server.use(
      http.post(url(apiRoutes.jiraTickets), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(answer);
      }),
    );

    expect(await api.createJiraTicket(ticket)).toEqual(answer);
    expect(sent).toEqual(ticket);
  });

  it('refuses an answer that isn’t the contract', async () => {
    server.use(http.post(url(apiRoutes.jiraTickets), () => HttpResponse.json({ result: 'made', key: 'MAI-142' })));
    await expect(api.createJiraTicket(makeNewJiraTicket())).rejects.toBeInstanceOf(ApiRequestError);
  });
});
