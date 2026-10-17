import { z } from 'zod';
import { GitHubLinkSchema, type InboxProblem } from '@devhub/contracts';
import type { GitHubProblem, GitHubPull } from './client.ts';

/**
 * A pull request the inbox keeps in the cache (spec 007), with the facts its rules need: titles and
 * metadata only, never a comment's text. Kept only when one of the facts says it needs you.
 */
export const PullRequestRecordSchema = z.object({
  /** `owner/repository#number`, unique on github.com. */
  id: z.string().min(1),
  /** The repository's name without its owner. */
  repository: z.string().min(1),
  number: z.int().positive(),
  title: z.string().min(1),
  url: GitHubLinkSchema,
  /** The author's GitHub name, else their login; null when GitHub names nobody. */
  author: z.string().min(1).nullable(),
  mine: z.boolean(),
  /** When your review was last asked for by name; null when it isn't. */
  reviewRequestedAt: z.iso.datetime().nullable(),
  /** When the first failing check on the latest commit finished; null when the checks aren't failing. */
  checksFailedAt: z.iso.datetime().nullable(),
  /** Unresolved review threads whose last comment isn't yours, and when the oldest of those comments came. */
  unresolved: z.object({ count: z.int().positive(), since: z.iso.datetime() }).nullable(),
});
export type PullRequestRecord = z.infer<typeof PullRequestRecordSchema>;

/** Check run conclusions GitHub counts as failing. */
const failedConclusions = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED']);
const failedRollups = new Set(['FAILURE', 'ERROR']);
const failedStatuses = new Set(['FAILURE', 'ERROR']);

function isoTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

/** The earliest of these times, or null when there are none. */
function earliest(times: readonly (string | null)[]): string | null {
  const known = times.filter((time) => time !== null).sort();
  return known[0] ?? null;
}

function sameLogin(a: string | undefined, b: string): boolean {
  return a?.toLowerCase() === b.toLowerCase();
}

function authorOf(author: GitHubPull['author']): string | null {
  const name = author?.name?.trim();
  if (name !== undefined && name !== '') return name;
  return author?.login ?? null;
}

function base(
  pull: GitHubPull,
  mine: boolean,
): Omit<PullRequestRecord, 'reviewRequestedAt' | 'checksFailedAt' | 'unresolved'> | null {
  const title = pull.title.trim();
  if (!GitHubLinkSchema.safeParse(pull.url).success) return null;
  return {
    id: `${pull.repository.nameWithOwner}#${String(pull.number)}`,
    repository: pull.repository.name,
    number: pull.number,
    title: title === '' ? `#${String(pull.number)}` : title,
    url: pull.url,
    author: authorOf(pull.author),
    mine,
  };
}

function reviewRequestedAt(pull: GitHubPull, login: string): string | null {
  const asked = (pull.timelineItems?.nodes ?? []).filter((event) => sameLogin(event?.requestedReviewer?.login, login));
  return isoTime(asked.at(-1)?.createdAt) ?? isoTime(pull.createdAt);
}

function checksFailedAt(pull: GitHubPull): string | null {
  const commit = pull.commits?.nodes.at(-1)?.commit;
  const rollup = commit?.statusCheckRollup;
  if (rollup === null || rollup === undefined || !failedRollups.has(rollup.state)) return null;
  const failedAt = rollup.contexts.nodes.map((context) => {
    if (context === null) return null;
    if (context.__typename === 'CheckRun') {
      return failedConclusions.has(context.conclusion ?? '') ? isoTime(context.completedAt) : null;
    }
    return failedStatuses.has(context.state) ? isoTime(context.createdAt) : null;
  });
  // No failing check among the first 100 says when: the latest commit's own time is the closest.
  return earliest(failedAt) ?? isoTime(commit?.committedDate) ?? isoTime(pull.createdAt);
}

function unresolved(pull: GitHubPull, login: string): PullRequestRecord['unresolved'] {
  const waiting = (pull.reviewThreads?.nodes ?? []).flatMap((thread) => {
    if (thread === null || thread.isResolved) return [];
    const last = thread.comments.nodes.at(-1);
    if (last === null || last === undefined || sameLogin(last.author?.login, login)) return [];
    return [isoTime(last.createdAt)];
  });
  const since = earliest(waiting);
  return waiting.length === 0 || since === null ? null : { count: waiting.length, since };
}

/**
 * The inbox's records from one answer: each review request to you, and each of your pull requests with
 * failing checks or unresolved comments. A pull request that needs nothing from you isn't kept.
 */
export function githubRecords(answer: {
  login: string;
  reviews: readonly GitHubPull[];
  mine: readonly GitHubPull[];
}): PullRequestRecord[] {
  const kept = new Map<string, PullRequestRecord>();
  for (const pull of answer.reviews) {
    const facts = base(pull, false);
    if (facts === null) continue;
    kept.set(facts.id, {
      ...facts,
      reviewRequestedAt: reviewRequestedAt(pull, answer.login),
      checksFailedAt: null,
      unresolved: null,
    });
  }
  for (const pull of answer.mine) {
    const facts = base(pull, true);
    if (facts === null) continue;
    const record = {
      ...facts,
      reviewRequestedAt: null,
      checksFailedAt: checksFailedAt(pull),
      unresolved: unresolved(pull, answer.login),
    };
    if (record.checksFailedAt !== null || record.unresolved !== null) kept.set(record.id, record);
  }
  return [...kept.values()];
}

/** A failed read in the inbox's terms (spec 007, Q5b). */
export function githubInboxProblem(problem: GitHubProblem): InboxProblem {
  switch (problem.kind) {
    case 'rejected':
      return { kind: 'rejected' };
    case 'rate_limited':
      return { kind: 'rate_limited', until: problem.resetAt === null ? null : new Date(problem.resetAt).toISOString() };
    case 'unreachable':
    case 'timeout':
    case 'github_error':
      return { kind: 'no_answer' };
  }
}
