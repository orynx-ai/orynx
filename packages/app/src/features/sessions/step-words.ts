import {
  orynxStatusNames,
  type BranchFrom,
  type Session,
  type SessionActivity,
  type SessionIntent,
  type SessionProblem,
} from '@devhub/contracts';

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

/** Why Orynx refused a call (spec 011 Q6; spec 012 Q7, Q8c); the Terminal's Claude tab says it too (spec 036). */
export function refusedTitle(
  activity: Pick<Extract<SessionActivity, { kind: 'refused' }>, 'access' | 'reason'>,
): string {
  switch (activity.reason) {
    case 'ask_everything':
      return "Couldn't edit files: Ask before everything is on";
    case 'push':
      return "Couldn't push or open a pull request: Settings didn't allow it";
    case 'background':
      return "Couldn't run a command in the background";
    case 'outside_worktree':
      return `Couldn't ${activity.access} outside the worktree`;
    case 'ask_session':
      return activity.access === 'run'
        ? "Couldn't run a command: this is an Ask session"
        : "Couldn't edit files: this is an Ask session";
  }
}

const ticketFieldNames: Record<Extract<SessionActivity, { kind: 'ticket' }>['fields'][number], string> = {
  title: 'title',
  description: 'description',
  type: 'type',
  priority: 'priority',
  status: 'status',
  dueDate: 'due date',
};

/** What one of Orynx's ticket tools did (spec 037, Q12i): "Created ORX-7", with the title or what changed below. */
function ticketWords(activity: Extract<SessionActivity, { kind: 'ticket' }>): StepWords {
  const key = activity.key ?? 'a ticket';
  switch (activity.action) {
    case 'listed':
      return { title: 'Read Orynx tickets', detail: null };
    case 'read':
      return { title: `Read ${key}`, detail: activity.title };
    case 'created':
      return { title: `Created ${key}`, detail: activity.title };
    case 'deleted':
      return { title: `Deleted ${key}`, detail: activity.title };
    case 'updated': {
      const others = activity.fields.filter((field) => field !== 'status').map((field) => ticketFieldNames[field]);
      const parts = [
        ...(activity.status === null ? [] : [`Status: ${orynxStatusNames[activity.status]}`]),
        ...(others.length === 0 ? [] : [`Changed the ${listOf(others) ?? ''}`]),
      ];
      return { title: `Updated ${key}`, detail: parts.length === 0 ? null : parts.join(' · ') };
    }
  }
}

/** What Claude did in Jira (spec 044, Q4, Q10): "Searched Jira" with how many it found, "Moved MAG-12 to In Review". */
function jiraWords(activity: Extract<SessionActivity, { kind: 'jira' }>): StepWords {
  const key = activity.key ?? 'an issue';
  switch (activity.action) {
    case 'projects':
      return { title: 'Read Jira projects', detail: null };
    case 'searched': {
      const found = activity.found ?? 0;
      const count = found === 0 ? 'No issues' : `${String(found)} ${found === 1 ? 'issue' : 'issues'}`;
      return { title: 'Searched Jira', detail: activity.more ? `${count}, more in Jira` : count };
    }
    case 'read':
      return { title: `Read ${key}`, detail: activity.summary };
    case 'commented':
      return { title: `Commented on ${key}`, detail: null };
    case 'moved':
      return { title: `Moved ${key} to ${activity.to ?? 'another status'}`, detail: null };
    case 'assigned':
      return { title: activity.to === 'nobody' ? `Unassigned ${key}` : `Assigned ${key} to you`, detail: null };
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

const intentWords: Record<SessionIntent, string> = { change: 'Code change', run: 'Run', answer: 'Question' };

/** Where a branch name's shape came from (spec 042, Q3). */
const branchFromWords: Record<BranchFrom, string> = {
  message: 'as your message says',
  repo_rules: "as the repository's written rules say",
  your_branches: 'like your recent branches',
  orynx: "Orynx's own name",
};

/** What Orynx read in your ask (spec 042, Q11): "Run · from develop · no branch yet". */
function readingWords(activity: Extract<SessionActivity, { kind: 'reading' }>): StepWords {
  if (activity.state === 'running') return { title: 'Reading your ask…', detail: null };
  if (activity.intent === null) return { title: "Couldn't read your ask, so the usual steps are shown", detail: null };
  const change = activity.intent === 'change' && activity.branch !== null;
  const title = [intentWords[activity.intent], ...(activity.base === null ? [] : [`from ${activity.base}`])];
  const notes = [
    ...(change && activity.branchFrom !== null
      ? [`Branch ${activity.branch ?? ''} at the first edit, ${branchFromWords[activity.branchFrom]}`]
      : []),
    ...(activity.missingBase === null
      ? []
      : [`${activity.missingBase} isn't on origin; started from ${activity.base ?? 'the default branch'}`]),
    ...(activity.suggested === null
      ? []
      : [
          activity.branchNote === 'taken'
            ? `${activity.suggested} is taken`
            : `"${activity.suggested}" couldn't be a branch name`,
        ]),
  ];
  return {
    title: [...title, ...(change ? [] : ['no branch yet'])].join(' · '),
    detail: notes.length === 0 ? null : notes.join(' · '),
  };
}

/** A server of the session's (spec 042): where it listens, or that it never did. */
function serverWords(activity: Extract<SessionActivity, { kind: 'server' }>): StepWords {
  const at = activity.port === null ? null : `localhost:${String(activity.port)}`;
  const titles = {
    started: at === null ? 'Started a server; nothing listens yet' : `Started a server on ${at}`,
    stopped: at === null ? 'Stopped the server' : `Stopped the server on ${at}`,
    exited: at === null ? 'The server ended before it listened' : `The server on ${at} ended`,
  };
  return { title: titles[activity.event], detail: activity.command };
}

const labelsOf = (steps: readonly { label: string }[]) => steps.map((step) => step.label).join(' · ');

export function stepWords(activity: SessionActivity): StepWords {
  const running = activity.state === 'running';
  switch (activity.kind) {
    case 'worktree': {
      const offline = !activity.fetched && !running && activity.base.startsWith('origin/');
      // Your pull request's own branch is named by its pull request (spec 031, Q8f).
      const from = activity.pullRequest === undefined ? activity.base : `#${String(activity.pullRequest)}`;
      return {
        title: running ? 'Making a worktree' : 'Made a worktree',
        // Since spec 042 the branch comes at the first edit, so a worktree is made from its base alone.
        detail: `${activity.branch === null ? 'from' : `${activity.branch} from`} ${from}${offline ? ' (last fetched, offline)' : ''}`,
      };
    }
    case 'reading':
      return readingWords(activity);
    case 'steps_changed':
      return {
        title: 'Steps changed',
        detail: [activity.reason, `Was: ${labelsOf(activity.from)}`, `Now: ${labelsOf(activity.to)}`].join('\n'),
      };
    case 'branch_made': {
      const from = branchFromWords[activity.from];
      return { title: `Made branch ${activity.branch}`, detail: `${from.charAt(0).toUpperCase()}${from.slice(1)}` };
    }
    case 'server':
      return serverWords(activity);
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
        // Then the skills your message named (spec 022, AC-53).
        ...activity.skills,
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
    case 'ticket':
      return ticketWords(activity);
    case 'jira':
      return jiraWords(activity);
    case 'stopped':
      return { title: 'You stopped Claude', detail: keepsChanges };
    case 'interrupted':
      return { title: 'Orynx closed while Claude was working', detail: keepsChanges };
    case 'discarded':
      return {
        title: 'Discarded the changes',
        // Your pull request's branch isn't the session's to delete (spec 031).
        detail: activity.kept
          ? `The worktree is deleted. ${activity.branch} stays as it is on GitHub.`
          : `The worktree and ${activity.branch} are deleted.`,
      };
  }
}

/** Jump to latest, once you've scrolled up from the end of Claude's progress (the user's call, 19 Oct 2026). */
export const followWords = { jump: 'Jump to latest' };

/** The words of a step shown in full (the user's call, 19 Oct 2026). */
export const stepDetailWords = {
  briefTitle: 'What Claude was sent',
  close: 'Close',
  briefNone: 'Nothing was sent to Claude yet.',
  briefFailed: "Couldn't read what Claude was sent.",
  tryAgain: 'Try again',
  showChanges: (path: string) => `Show the changes in ${path}`,
};

export interface ProblemWords {
  title: string;
  /** May hold a command in backticks, which the screen shows as code. */
  line: string;
}

export function problemWords(problem: SessionProblem, session: Session): ProblemWords {
  const key = session.source?.kind === 'jira' ? session.source.key : 'the ticket';
  const lines: Record<SessionProblem['kind'], string> = {
    jira: `Orynx couldn't read ${key} from Jira. Check Settings › Connections, then start again.`,
    folder: `${session.folder?.displayPath ?? 'The folder'} isn't a git repository any more. Check Settings › Repositories.`,
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
