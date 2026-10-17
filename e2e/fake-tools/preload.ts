// Loaded with `node --import` ahead of the real host (apps/server/dist/main.mjs) for the second e2e hub
// (playwright.config.ts). Jira and GitHub are outside services, so MSW stands in for them inside the
// server's own process, with the same answers packages/core's tests use. Any other request out fails,
// so the run can never reach the real internet.
import { createServer } from 'node:http';
import { setupServer } from 'msw/node';
import {
  acceptingIssueSearch,
  acceptingMyself,
  acceptingPrioritySearch,
  acceptingProjectSearch,
} from '../../packages/core/src/test/fake-jira.ts';
import { acceptingInboxQuery, acceptingUser } from '../../packages/core/src/test/fake-github.ts';
import { fakeToolsControlPort, type FakeTools } from './config.ts';

let tools: FakeTools = { issues: [], reviews: [], mine: [] };

function handlers() {
  return [
    acceptingMyself(),
    acceptingProjectSearch([]),
    acceptingPrioritySearch(),
    acceptingIssueSearch(tools.issues),
    acceptingUser(),
    acceptingInboxQuery({ reviews: tools.reviews, mine: tools.mine }),
  ];
}

const network = setupServer(...handlers());
network.listen({ onUnhandledFrame: 'error' });

// The spec sets what the tools hold; the hub sees it on its next sync.
createServer((request, response) => {
  if (request.method !== 'PUT' || request.url !== '/tools') {
    response.writeHead(404).end();
    return;
  }
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk: string) => {
    body += chunk;
  });
  request.on('end', () => {
    tools = JSON.parse(body) as FakeTools;
    network.resetHandlers(...handlers());
    response.writeHead(204).end();
  });
}).listen(fakeToolsControlPort, '127.0.0.1');
