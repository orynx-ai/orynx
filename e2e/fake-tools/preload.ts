// Loaded with `node --import` ahead of the real host (apps/server/dist/main.mjs) for the second e2e hub
// (playwright.config.ts). Jira and GitHub are outside services, so MSW stands in for them inside the
// server's own process, with the same answers packages/core's tests use. Any other request out fails,
// so the run can never reach the real internet.
import { createServer } from 'node:http';
import { setupServer } from 'msw/node';
import {
  acceptingBoardConfiguration,
  acceptingFieldList,
  acceptingIssue,
  acceptingIssueSearch,
  acceptingMySprintSearch,
  acceptingSprintIssueSearch,
  acceptingStatusList,
  designBoardColumns,
  acceptingMyself,
  acceptingPrioritySearch,
  acceptingProjectSearch,
} from '../../packages/core/src/test/fake-jira.ts';
import {
  acceptingInboxQuery,
  acceptingPullContext,
  acceptingPullDiff,
  acceptingPulls,
  acceptingPullStates,
  acceptingRepository,
  acceptingReviewThreads,
  acceptingUser,
} from '../../packages/core/src/test/fake-github.ts';
import { http, HttpResponse } from 'msw';
import { controlPortFor, type FakeTools } from './config.ts';
import { fakeReleasesUrl } from './releases.ts';

let tools: FakeTools = { issues: [], reviews: [], mine: [] };
// Each hub's own control port, so two hubs with these fakes can run side by side.
const controlPort = controlPortFor(Number(process.env['DEVHUB_PORT']));

/** Sprint 42 on board 7, holding every issue, for a spec that asks for a board. */
function sprintHandlers() {
  if (tools.sprint !== true) return [];
  const inSprint = tools.issues.map((issue) => ({ ...issue, sprints: [{ id: 42, name: 'Sprint 42', boardId: 7 }] }));
  return [
    acceptingFieldList(),
    // These answer only their own searches, so they go before the inbox's.
    acceptingMySprintSearch(inSprint),
    acceptingSprintIssueSearch(42, inSprint),
    acceptingBoardConfiguration(7, designBoardColumns),
    acceptingStatusList(),
  ];
}

function handlers() {
  return [
    ...sprintHandlers(),
    acceptingMyself(),
    acceptingProjectSearch([]),
    acceptingPrioritySearch(),
    acceptingIssueSearch(tools.issues),
    // A session reads its ticket on its own (spec 011).
    acceptingIssue(
      tools.issues
        .filter((issue) => tools.brokenIssues?.includes(issue.key) !== true)
        .map((issue) => ({
          key: issue.key,
          summary: issue.summary ?? `Summary of ${issue.key}`,
          type: issue.type ?? 'Story',
        })),
    ),
    acceptingUser(),
    // The composer's pull requests (spec 015); this handler answers only its own query.
    acceptingPullContext(
      (tools.pullRequests ?? []).map(({ number, title, body, head, author }) => ({
        number,
        title,
        ...(body === undefined ? {} : { body }),
        ...(head === undefined ? {} : { head }),
        ...(author === undefined ? {} : { author }),
      })),
    ),
    // A session's pull request merged or closed (spec 047); a request for the diff goes on to the next handler.
    acceptingReviewThreads([{ number: 2841, threads: tools.reviewThreads ?? [] }], {
      posted: (tools.threadWrites ??= []),
    }),
    acceptingPullStates(tools.pullStates ?? []),
    acceptingPullDiff((tools.pullRequests ?? []).map(({ number, diff }) => ({ number, diff }))),
    acceptingInboxQuery({ reviews: tools.reviews, mine: tools.mine }),
    // Create pull request (spec 014): the pull requests GitHub opens join the spec's list.
    ...acceptingPulls({ opened: (tools.pulls ??= []) }),
    acceptingRepository(),
    // Settings › About's check for updates (spec 045): no release yet, so these hubs put nothing in the bell.
    http.get(fakeReleasesUrl, () => HttpResponse.json([])),
  ];
}

const network = setupServer(...handlers());
network.listen({
  // A callback rather than 'error', which still lets requests that look like static files through.
  onUnhandledFrame: () => {
    throw new Error('The e2e hub asked the real network for something the fakes do not answer.');
  },
});

// The spec sets what the tools hold; the hub sees it on its next sync. Only this machine's own address is
// answered, so a page elsewhere can't reach it through a rebound name.
createServer((request, response) => {
  if (request.headers.host !== `127.0.0.1:${String(controlPort)}`) {
    response.writeHead(403).end();
    return;
  }
  if (request.url !== '/tools' || (request.method !== 'PUT' && request.method !== 'GET')) {
    response.writeHead(404).end();
    return;
  }
  // What the tools hold now, with the pull requests GitHub opened (spec 014).
  if (request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(tools));
    return;
  }
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk: string) => {
    body += chunk;
  });
  request.on('end', () => {
    try {
      // Unchecked: only the spec writes here, and a wrong shape fails its own sync loudly.
      tools = JSON.parse(body) as FakeTools;
    } catch {
      response.writeHead(400).end();
      return;
    }
    network.resetHandlers(...handlers());
    response.writeHead(204).end();
  });
}).listen(controlPort, '127.0.0.1');
