import { z } from 'zod';
import { GitHubLinkSchema } from './github.ts';
import { InboxToolStateSchema } from './inbox.ts';
import { JiraLinkSchema } from './jira.ts';
import { SessionSummarySchema } from './session.ts';

/**
 * ⌘K search (spec 009). The server sends everything DevHub holds that search can find, each group already
 * in its own order, and the browser matches as you type, so typing never sends a request. Titles and
 * metadata only, as the inbox's cache holds them.
 */

/**
 * Where a ticket goes: its newest Claude session in DevHub, else the issue on its Jira site (Q2c), or for one of
 * Orynx's own tickets, which has no site, its ticket dialog (spec 037, AC-26).
 */
export const SearchTicketTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('external'), url: JiraLinkSchema }),
  z.object({ kind: z.literal('session'), sessionId: z.string().min(1) }),
  z.object({ kind: z.literal('ticket') }),
]);
export type SearchTicketTarget = z.infer<typeof SearchTicketTargetSchema>;

/** A Jira ticket assigned to you and not Done, or in the current sprint; or any of Orynx's own (spec 037). */
export const SearchTicketSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  /** The status's own name, shown as it is. */
  status: z.string(),
  target: SearchTicketTargetSchema,
  /** Assigned to you, or one of Orynx's own: the composer's ticket list holds these alone (the user's call, 20 Oct 2026). */
  mine: z.boolean(),
});
export type SearchTicket = z.infer<typeof SearchTicketSchema>;

/** An open pull request: yours, or one waiting for your review. It opens on GitHub, on its main page. */
export const SearchPullRequestSchema = z.object({
  /** `owner/repository#number`, unique on github.com. */
  id: z.string().min(1),
  /** The repository's name without its owner. */
  repository: z.string().min(1),
  number: z.int().positive(),
  title: z.string().min(1),
  /** The author's GitHub name, else their login; null when GitHub names nobody. */
  author: z.string().min(1).nullable(),
  url: GitHubLinkSchema,
});
export type SearchPullRequest = z.infer<typeof SearchPullRequestSchema>;

/** GET /api/search: tickets, then pull requests newest first, then sessions newest first. */
export const SearchIndexSchema = z.object({
  tickets: z.array(SearchTicketSchema),
  pullRequests: z.array(SearchPullRequestSchema),
  sessions: z.array(SessionSummarySchema),
  /** Where each tool stands: not connected, still on its first sync, synced or failed (AC-22, AC-24). */
  tools: z.object({ jira: InboxToolStateSchema, github: InboxToolStateSchema }),
});
export type SearchIndex = z.infer<typeof SearchIndexSchema>;
