import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';

/** The origin the app under test calls. MSW stands in for the network, nothing else. */
export const testBaseURL = 'http://127.0.0.1:4317';

export function apiUrl(path: string): string {
  return new URL(path, testBaseURL).toString();
}

/** Default answers for every endpoint; a test overrides one with server.use(...). */
export const server = setupServer(http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus())));
