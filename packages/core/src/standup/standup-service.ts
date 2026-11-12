import type { Session, Standup } from '@devhub/contracts';
import type { GitHubClient } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import type { JiraClient } from '../integrations/jira/client.ts';
import type { JiraSyncCredentials } from '../integrations/jira/connection.ts';
import type { SessionRecords } from '../sessions/session-store.ts';
import { calendarDay, lastWorkingDay, standupText, type StandupFacts } from './standup-text.ts';

export interface StandupServiceOptions {
  sessions: SessionRecords;
  github: { client: Pick<GitHubClient, 'mergedOn'>; credentials(): Promise<GitHubSyncCredentials | null> };
  jira: { client: Pick<JiraClient, 'search'>; credentials(): Promise<JiraSyncCredentials | null> };
}

export interface StandupService {
  /** The draft for the last working day (spec 057, C). Reads only; never posts. */
  draft(): Promise<Standup>;
}

const ticketOf = (session: Session | undefined) => (session?.source?.kind === 'jira' ? session.source.key : null);

/**
 * Your standup, drafted from a template (spec 057, Q5): your sessions' pull requests, reviews and Jira moves, your
 * merged pull requests on GitHub, and your Jira moves and work in progress. A source that can't be read is `missing`.
 */
export function createStandupService(options: StandupServiceOptions): StandupService {
  return {
    async draft() {
      const day = lastWorkingDay(new Date());
      const next = calendarDay(new Date(new Date(`${day}T12:00:00`).getTime() + 86_400_000));
      const onDay = (at: string | null | undefined) => at != null && calendarDay(new Date(at)) === day;
      const stored = await Promise.all((await options.sessions.list()).map(({ id }) => options.sessions.get(id)));
      const sessions = stored.flatMap((record) => (record === null ? [] : [record.session]));
      const missing: Standup['missing'] = [];

      const facts: StandupFacts = {
        merged: [],
        opened: sessions.flatMap((session) =>
          session.pullRequest !== null && onDay(session.pullRequest.openedAt)
            ? [{ number: session.pullRequest.number, title: session.title, ticket: ticketOf(session) }]
            : [],
        ),
        // Claude's own moves, then yours from Jira's search, by key.
        moved: sessions.flatMap((session) =>
          session.activities.flatMap((activity) =>
            activity.kind === 'jira' && activity.action === 'moved' && activity.key !== null && activity.to !== null
              ? onDay(activity.at)
                ? [{ key: activity.key, status: activity.to }]
                : []
              : [],
          ),
        ),
        reviewed: sessions.flatMap(({ review }) =>
          review?.posted.some((posted) => onDay(posted.at)) === true
            ? [{ repository: review.repository, number: review.number }]
            : [],
        ),
        finished: sessions.flatMap((session) =>
          session.state === 'done' && session.pullRequest === null && onDay(session.endedAt)
            ? [{ title: session.title, ticket: ticketOf(session) }]
            : [],
        ),
        today: [],
        waiting: sessions.flatMap((session) => (session.state === 'needs_you' ? [{ title: session.title }] : [])),
      };

      const github = await options.github.credentials();
      const found = github?.ok === true ? await options.github.client.mergedOn(github.token, day) : null;
      if (found?.ok === true) {
        facts.merged = found.pulls.map((pull) => {
          const own = sessions.find(
            (session) =>
              session.pullRequest?.number === pull.number && session.pullRequest.repository === pull.repository,
          );
          return { number: pull.number, title: pull.title, ticket: ticketOf(own) };
        });
      } else missing.push('github');

      const jira = await options.jira.credentials();
      if (jira?.ok === true) {
        const [moves, working] = await Promise.all([
          options.jira.client.search(
            jira.request,
            `status CHANGED BY currentUser() DURING ("${day}", "${next}") ORDER BY updated DESC`,
            20,
          ),
          options.jira.client.search(
            jira.request,
            'assignee = currentUser() AND sprint in openSprints() AND statusCategory = "In Progress" ORDER BY updated DESC',
            20,
          ),
        ]);
        if (moves.ok && working.ok) {
          // shortcut: Jira's search gives an issue's status now, not the one it moved to; a changelog read would.
          const fromJira = moves.issues.flatMap((issue) =>
            issue.status === null ? [] : [{ key: issue.key, status: issue.status }],
          );
          const keys = new Set(fromJira.map((move) => move.key));
          facts.moved = [...fromJira, ...facts.moved.filter((move) => !keys.has(move.key))];
          facts.today = working.issues.map((issue) => ({
            key: issue.key,
            title: issue.summary,
            status: issue.status ?? '',
          }));
        } else missing.push('jira');
      } else missing.push('jira');

      return { day, text: standupText(facts), missing };
    },
  };
}
