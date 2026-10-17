import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { apiRoutes, type ApiError, type JiraConnection } from '@devhub/contracts';
import { makeJiraConnection, makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from './msw.ts';

/** A site and email the server has saved. */
export const savedJira = { site: 'your-team.atlassian.net', email: 'dev@example.com' };

export const connectedJiraStatus = makeStatus({
  integrations: { jira: { state: 'connected', detail: 'Personal API token for your-team.atlassian.net' } },
});

/** The Jira row in Settings › Connections, found by the name a person reads. */
export async function jiraRow(): Promise<HTMLElement> {
  const list = await screen.findByRole('list', { name: 'Connections' });
  const row = within(list)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByText('Jira', { selector: 'span' }) !== null);
  if (!row) throw new Error('No Jira row');
  return row;
}

/**
 * Answers like a hub whose Jira accepts: PUT saves and flips the status to connected, DELETE
 * disconnects. Returns every body the page sent, so a test can check what left the page.
 */
export function jiraServer(start: { connection?: JiraConnection; connected?: boolean } = {}) {
  const sent: unknown[] = [];
  let connection = start.connection ?? makeJiraConnection();
  let connected = start.connected ?? false;
  server.use(
    http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(connected ? connectedJiraStatus : makeStatus())),
    http.get(apiUrl(apiRoutes.jiraConnection), () => HttpResponse.json(connection)),
    http.put(apiUrl(apiRoutes.jiraConnection), async ({ request }) => {
      sent.push(await request.json());
      connected = true;
      connection = makeJiraConnection({ ...connection, saved: savedJira });
      return HttpResponse.json(connection);
    }),
    http.delete(apiUrl(apiRoutes.jiraConnection), () => {
      sent.push('DELETE');
      connected = false;
      connection = makeJiraConnection({ ...connection, saved: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
}

/** PUT /api/jira/connection fails with this status and error body. */
export function failingJiraSave(status: number, body: ApiError) {
  server.use(http.put(apiUrl(apiRoutes.jiraConnection), () => HttpResponse.json(body, { status })));
}
