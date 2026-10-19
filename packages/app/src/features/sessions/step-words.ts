import type { Session, SessionActivity, SessionProblem } from '@devhub/contracts';

/**
 * The words for each step of "Claude's progress" and for a session that couldn't start (spec 011, Q10a and
 * Q10f; spec 013, Q10d and Q10e; spec 014, Q11e). The server sends what happened; these say it. A running step is in the present tense, a done one
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

/** A message shows its first 3 lines, then "…" (spec 013, Q10e). */
function firstLines(text: string): string {
  const lines = text.split('\n');
  return lines.length <= 3 ? text : [...lines.slice(0, 3), '…'].join('\n');
}

/** Why Orynx refused a call (spec 011 Q6; spec 012 Q7, Q8c). */
function refusedTitle(activity: Extract<SessionActivity, { kind: 'refused' }>): string {
  switch (activity.reason) {
    case 'ask_everything':
      return "Couldn't edit files: Ask before everything is on";
    case 'push':
      return "Couldn't push: that waits for Create pull request";
    case 'background':
      return "Couldn't run a command in the background";
    case 'outside_worktree':
      return `Couldn't ${activity.access} outside the worktree`;
  }
}

/** What Claude wants: its own line about the command when it gave one, or the file it would edit (spec 012, Q8c). */
function waitingDetail(activity: Extract<SessionActivity, { kind: 'waiting' }>): string {
  if (activity.about === 'edit') return `Wants to edit ${activity.text ?? 'a file'}`;
  return activity.text ?? 'Wants to run a command';
}

/** "4 files", "1 file". */
function filesText(count: number): string {
  return `${String(count)} ${count === 1 ? 'file' : 'files'}`;
}

/** What Orynx did before the pull request opened: committed, then pushed, or only pushed (spec 014, Q11e). */
function pushedDetail(files: number, branch: string): string {
  return files === 0 ? `Pushed ${branch}` : `Committed ${filesText(files)} and pushed ${branch}`;
}

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
    case 'brief': {
      // The ticket alone is its description (spec 011); a composer brief names each part (spec 015, AC-24).
      const parts = [
        ...(activity.message ? ['your message'] : []),
        ...(activity.key === null ? [] : [activity.key]),
        // The other tickets, after the session's own (spec 022, Q2).
        ...activity.tickets,
        ...activity.pullRequests,
        // A file by its name; its full path shows in the step's tooltip (spec 022, AC-17).
        ...activity.files.map(nameOf),
      ];
      const ticketAlone = activity.key !== null && parts.length === 1;
      const said = ticketAlone ? `${activity.key} and its description` : listOf(parts);
      return { title: 'Sent Claude the brief', detail: said?.replace(/^your message/, 'Your message') ?? null };
    }
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
      return { title: refusedTitle(activity), detail: activity.path };
    case 'waiting':
      return { title: 'Waiting for your approval', detail: waitingDetail(activity) };
    case 'command': {
      const count = activity.commands.length;
      return {
        title: running ? 'Running a command' : `Ran ${String(count)} ${count === 1 ? 'command' : 'commands'}`,
        detail: listOf(activity.commands),
      };
    }
    case 'denied':
      return {
        title: activity.about === 'command' ? 'You denied a command' : 'You denied an edit',
        detail: activity.text,
      };
    case 'no_commands':
      return { title: "Commands are off: Claude Code's sandbox can't run on this computer", detail: null };
    case 'finished':
      return { title: 'Finished', detail: activity.summary.trim() === '' ? null : activity.summary };
    case 'message':
      return { title: 'You asked Claude', detail: firstLines(activity.text) };
    case 'pull_request':
      return {
        title: `${activity.linked ? 'Linked' : 'Opened'} pull request #${String(activity.number)}`,
        detail: pushedDetail(activity.files, activity.branch),
      };
    case 'pushed':
      return {
        title: `Pushed changes to #${String(activity.number)}`,
        detail: activity.files === 0 ? null : `Committed ${filesText(activity.files)}`,
      };
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
    resume: "Claude Code no longer has this session's conversation. Start again from the ticket.",
    other: 'See the terminal for details.',
  };
  // A follow-up Claude Code couldn't resume isn't a start that failed, nor an error while working (spec 013, Q10d).
  if (problem.kind === 'resume') return { title: "Claude couldn't carry on", line: lines.resume };
  return {
    title: problem.stage === 'starting' ? "Claude couldn't start" : 'Claude stopped with an error',
    line: lines[problem.kind],
  };
}
