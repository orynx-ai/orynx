import type { FakeIssue } from '../../packages/core/src/test/fake-jira.ts';
import type { FakePull } from '../../packages/core/src/test/fake-github.ts';

/**
 * The second e2e hub: the real server as `pnpm start` builds it, with Jira and GitHub faked inside its
 * process by `preload.ts`. It has its own port and data folder, so connecting tools there never touches
 * the hub the other specs use.
 */
export const fakeToolsHubPort = 4398;

/** The third e2e hub, for sessions (spec 011): the same fakes, its own data folder, so sessions stay out of the other specs. */
export const sessionsHubPort = 4396;

/** Where a spec tells a hub's fakes what Jira and GitHub hold, with `PUT /tools`: the port below the hub's. */
export function controlPortFor(hubPort: number): number {
  return hubPort - 1;
}

export const fakeToolsControlPort = controlPortFor(fakeToolsHubPort);

/** What the fake Jira and GitHub hold: your Jira issues, the pull requests asking for your review, and yours. */
export interface FakeTools {
  issues: FakeIssue[];
  reviews: FakePull[];
  mine: FakePull[];
  /** Put your issues in Sprint 42, so Tickets has a board (spec 011's e2e). Off by default. */
  sprint?: boolean;
  /** Issues whose own page Jira won't give (a 404), so a session on one couldn't start (spec 011, AC-13). */
  brokenIssues?: string[];
}
