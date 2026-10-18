import type { FakeIssue } from '../../packages/core/src/test/fake-jira.ts';
import type { FakePull } from '../../packages/core/src/test/fake-github.ts';

/**
 * The second e2e hub: the real server as `pnpm start` builds it, with Jira and GitHub faked inside its
 * process by `preload.ts`. It has its own port and data folder, so connecting tools there never touches
 * the hub the other specs use.
 */
export const fakeToolsHubPort = 4398;

/** Where a spec tells the fakes what Jira and GitHub hold, with `PUT /tools`. */
export const fakeToolsControlPort = 4397;

/** What the fake Jira and GitHub hold: your Jira issues, the pull requests asking for your review, and yours. */
export interface FakeTools {
  issues: FakeIssue[];
  reviews: FakePull[];
  mine: FakePull[];
}
