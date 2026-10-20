import type { FakeIssue } from '../../packages/core/src/test/fake-jira.ts';
import type { FakeOpenedPull, FakePull } from '../../packages/core/src/test/fake-github.ts';

/**
 * The second e2e hub: the real server as `pnpm start` builds it, with Jira and GitHub faked inside its
 * process by `preload.ts`. It has its own port and data folder, so connecting tools there never touches
 * the hub the other specs use.
 */
export const fakeToolsHubPort = 4398;

/** The third e2e hub, for sessions (spec 011): the same fakes, its own data folder, so sessions stay out of the other specs. */
export const sessionsHubPort = 4396;

/**
 * The fourth, for approvals (spec 012): its permission mode and allow list change from test to test, which
 * would change what the sessions spec's Claude may do.
 */
export const approvalsHubPort = 4394;

/**
 * The fifth, for live changes and follow-ups (spec 013): its sessions resume the fake Claude Code and write into
 * their worktrees, and its folder is mapped to its own project, so Build never offers the other specs' folders.
 */
export const changesHubPort = 4392;

/**
 * The sixth, for Create pull request (spec 014): its folder's origin reads as github.com, its git has a name of
 * its own (HOME is a folder of the run's), and its fake GitHub opens pull requests.
 */
export const pullRequestsHubPort = 4390;

/**
 * The seventh, for Home's composer (spec 015): its sessions start from your words and chips, and its fakes give
 * pull requests' details and diffs. 014's hub takes 4390.
 */
export const composerHubPort = 4388;

/** The eighth, for Sync activity (spec 035): its syncs and their log stay away from Home's inbox spec. */
export const syncActivityHubPort = 4384;

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
  /** The pull requests GitHub has (spec 014): it opens more into this list, which `GET /tools` gives back. */
  pulls?: FakeOpenedPull[];
  /** Pull requests whose details and diff GitHub gives the composer, in acme/web-app (spec 015). */
  pullRequests?: { number: number; title: string; body?: string; diff: string }[];
}
