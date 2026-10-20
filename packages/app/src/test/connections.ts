import { http, HttpResponse } from 'msw';
import { apiRoutes, type Status } from '@devhub/contracts';
import { makeGitHubConnection, makeJiraConnection, makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from './msw.ts';

const minute = 60_000;

/** Jira connected and checked 2 minutes ago, GitHub's gh login expired, no Slack: the design's page (spec 030). */
export function mixedStatus(): Status {
  return makeStatus({
    integrations: {
      jira: {
        state: 'connected',
        detail: 'Personal API token for your-team.atlassian.net',
        account: 'dev@example.com',
        checkedAt: new Date(Date.now() - 2 * minute).toISOString(),
      },
      github: {
        state: 'error',
        detail: "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.",
      },
    },
  });
}

/** Answers GET status with `status()` each time, with Jira's site and GitHub's gh way saved. */
export function answerWith(status: () => Status) {
  server.use(
    http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(status())),
    http.get(apiUrl(apiRoutes.jiraConnection), () =>
      HttpResponse.json(makeJiraConnection({ saved: { site: 'your-team.atlassian.net', email: 'dev@example.com' } })),
    ),
    http.get(apiUrl(apiRoutes.githubConnection), () =>
      HttpResponse.json(makeGitHubConnection({ saved: { method: 'gh' }, ghFound: true })),
    ),
  );
}
