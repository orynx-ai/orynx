import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import {
  apiRoutes,
  GitHubConnectionRequestSchema,
  type ApiError,
  type GitHubConnection,
  type GitHubMethod,
} from '@devhub/contracts';
import { makeGitHubConnection, makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from './msw.ts';

const connectedLines: Record<GitHubMethod, string> = {
  gh: 'Signed in as octocat with the gh command-line tool',
  token: 'Personal access token for octocat',
};

/** The GitHub row in Settings › Connections, found by the name a person reads. */
export async function githubRow(): Promise<HTMLElement> {
  const list = await screen.findByRole('list', { name: 'Connections' });
  const row = within(list)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByText('GitHub', { selector: 'span' }) !== null);
  if (!row) throw new Error('No GitHub row');
  return row;
}

/**
 * Answers like a hub whose GitHub accepts: PUT saves the way and flips the status to connected,
 * DELETE disconnects. Returns every body the page sent, so a test can check what left the page.
 */
export function githubServer(start: { connection?: GitHubConnection } = {}) {
  const sent: unknown[] = [];
  let connection = start.connection ?? makeGitHubConnection({ ghFound: true });
  const status = () =>
    connection.saved === null
      ? makeStatus()
      : makeStatus({
          integrations: { github: { state: 'connected', detail: connectedLines[connection.saved.method] } },
        });
  server.use(
    http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(status())),
    http.get(apiUrl(apiRoutes.githubConnection), () => HttpResponse.json(connection)),
    http.put(apiUrl(apiRoutes.githubConnection), async ({ request }) => {
      // What the page sent, checked against the contract the real server uses.
      const body = GitHubConnectionRequestSchema.parse(await request.json());
      sent.push(body);
      connection = makeGitHubConnection({ ...connection, saved: { method: body.method } });
      return HttpResponse.json(connection);
    }),
    http.delete(apiUrl(apiRoutes.githubConnection), () => {
      sent.push('DELETE');
      connection = makeGitHubConnection({ ...connection, saved: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
}

/** PUT /api/github/connection fails with this status and error body. */
export function failingGitHubSave(status: number, body: ApiError) {
  server.use(http.put(apiUrl(apiRoutes.githubConnection), () => HttpResponse.json(body, { status })));
}
