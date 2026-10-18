import type { Session, SessionActivity, SessionProblem } from '@devhub/contracts';

/**
 * The words for each step of "Claude's progress" and for a session that couldn't start (spec 011, Q10a and
 * Q10f). The server sends what happened; these say it. A running step is in the present tense, a done one
 * in the past.
 */

export interface StepWords {
  title: string;
  detail: string | null;
}

/** A file's own name: "ContentList.tsx" for "src/content/ContentList.tsx". */
function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || path;
}

/** "A", "A and B", "A, B and C", then "A, B, C and 6 more"; null for none. */
function listOf(items: readonly string[]): string | null {
  if (items.length === 0) return null;
  if (items.length <= 3) {
    return items.length === 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
  }
  return `${items.slice(0, 3).join(', ')} and ${String(items.length - 3)} more`;
}

const keepsChanges = 'The worktree keeps the changes.';

export function stepWords(activity: SessionActivity): StepWords {
  const running = activity.state === 'running';
  switch (activity.kind) {
    case 'worktree': {
      const offline = !activity.fetched && !running && activity.base.startsWith('origin/');
      return {
        title: running ? 'Making a worktree' : 'Made a worktree',
        detail: `${activity.branch} from ${activity.base}${offline ? ' (last fetched, offline)' : ''}`,
      };
    }
    case 'brief':
      return { title: 'Sent Claude the brief', detail: `${activity.key} and its description` };
    case 'explore':
      return {
        title: running ? 'Exploring the code' : 'Explored the code',
        detail: listOf(activity.files.map(nameOf)),
      };
    case 'plan':
      return { title: running ? 'Making a plan' : 'Made a plan', detail: listOf(activity.items) };
    case 'edit': {
      const count = activity.files.length;
      return {
        title: running ? 'Editing files' : `Edited ${String(count)} ${count === 1 ? 'file' : 'files'}`,
        detail: listOf(activity.files.map(nameOf)),
      };
    }
    case 'refused':
      return {
        title:
          activity.reason === 'ask_everything'
            ? "Couldn't edit files: Ask before everything is on"
            : `Couldn't ${activity.access} outside the worktree`,
        detail: activity.path,
      };
    case 'finished':
      return { title: 'Finished', detail: activity.summary.trim() === '' ? null : activity.summary };
    case 'stopped':
      return { title: 'You stopped Claude', detail: keepsChanges };
    case 'interrupted':
      return { title: 'Orynx closed while Claude was working', detail: keepsChanges };
    case 'discarded':
      return { title: 'Discarded the changes', detail: `The worktree and ${activity.branch} are deleted.` };
  }
}

export interface ProblemWords {
  title: string;
  /** May hold a command in backticks, which the screen shows as code. */
  line: string;
}

export function problemWords(problem: SessionProblem, session: Session): ProblemWords {
  const key = session.source?.kind === 'jira' ? session.source.key : 'the ticket';
  const lines: Record<SessionProblem['kind'], string> = {
    jira: `Orynx couldn't read ${key} from Jira. Check Settings › Connections, then start again.`,
    folder: `${session.folder.displayPath} isn't a git repository any more. Check Settings › Repositories.`,
    git: "git couldn't make the worktree. See the terminal for details.",
    login: "Claude Code's login didn't work. Sign in with `claude` in a terminal, then start again.",
    limit: "Claude's service is busy or your usage limit is reached. Try again later.",
    other: 'See the terminal for details.',
  };
  return {
    title: problem.stage === 'starting' ? "Claude couldn't start" : 'Claude stopped with an error',
    line: lines[problem.kind],
  };
}
